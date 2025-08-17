// pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfworker.min.mjs';
// import { pdfjsLib } from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.mjs";
import * as glMatrix from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";


pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54/build/pdf.worker.mjs";

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var offscreenCanvas = document.createElement("canvas");
offscreenCanvas.width = canvas.width;
offscreenCanvas.height = canvas.height;
var oCtx = offscreenCanvas.getContext("2d");

var pdf, currPage;
var currPageTransform = glMatrix.mat3.create();
var currPageTranslation = glMatrix.vec2.create();
var currPageScale = 1;
var readyToRepaint = true;
var pageNumber = 1;
const worker = await Tesseract.createWorker('eng');

function loadPdf(file) {
	const reader = new FileReader();
	reader.onload = async (e) => {
		const arrayBuffer = e.target.result;
		const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
		try {
			pdf = await loadingTask.promise;
			pdf.getPage(pageNumber).then(function (_page) {
				currPage = _page;
				repaint();
			});
			console.log('PDF loaded:', pdf.numPages, 'pages');
		} catch (error) {
			console.error('Error loading PDF:', error);
		}
	};
	reader.readAsArrayBuffer(file);
}

// loadPdf("/test2.pdf");

window.loadPdf = loadPdf;
window.ctx = ctx;
window.canvas = canvas;

var renderQueue = [];

function repaint(reloadPage) {
	// @param reloadPage: whether to reload the page (false for usually, if you're switching pages then true)
	renderQueue.push(reloadPage);
}

setInterval(function () {
	if (renderQueue.length && readyToRepaint) {
		repaintUtil(renderQueue.shift());
	}
}, 1);

function actualRepaintLmao() {
	glMatrix.mat3.identity(currPageTransform);

	glMatrix.mat3.translate(currPageTransform, currPageTransform, [canvas.width / 2, canvas.height / 2, 0]);
	glMatrix.mat3.scale(currPageTransform, currPageTransform, [currPageScale, currPageScale, currPageScale]);
	glMatrix.mat3.translate(currPageTransform, currPageTransform, [-canvas.width / 2, -canvas.height / 2, 0]);

	glMatrix.mat3.translate(currPageTransform, currPageTransform, [currPageTranslation[0], currPageTranslation[1], 0]);

	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height); // clear the canvas
	currPage.render({
		canvasContext: ctx,
		viewport: currPage.getViewport({ scale: 1 }),
		transform: [currPageTransform[0], currPageTransform[1], currPageTransform[3], currPageTransform[4], currPageTransform[6], currPageTransform[7]],
		background: "black"
	}).promise.then(function () {
		readyToRepaint = true;
	});
	readyToRepaint = false;
}

function repaintUtil(reloadPage) {
	if (reloadPage) {
		pdf.getPage(pageNumber).then(function (_page) {
			currPage = _page;
			actualRepaintLmao();
		});
	} else {
		actualRepaintLmao();
	}
}

// mouse dragging dumb stuff
var isMouseDown = false, lastX, lastY, startX, startY, touchId;
var dragBox_x1, dragBox_x2, dragBox_y1, dragBox_y2;
var dragMode = true, overlayBox = document.getElementById("overlayBox");

canvas.addEventListener("mousedown", mouseDown);
canvas.addEventListener("touchstart", touchStart);

function touchStart(e) {
	touchId = e.touches.item(0).identifier;
	e.preventDefault();
	mouseDown(e.touches.item(0));
}

var posName = "client"; // cause positioning dumb

function mouseDown(e) {
	isMouseDown = true;
	lastX = startX = e[posName + "X"];
	lastY = startY = e[posName + "Y"];
	if (e.preventDefault) {
		e.preventDefault();
	}
	if (!dragMode) {
		overlayBox.style.display = "block";
		mouseMove(e); // update the div
	}
}

addEventListener("mouseup", mouseUp);
addEventListener("touchend", mouseUp);

function mouseUp() {
	isMouseDown = false;
	if (!dragMode) {
		var rect = canvas.getBoundingClientRect();
		dragBox_x1 -= rect.left;
		dragBox_x2 -= rect.left;
		dragBox_y1 -= rect.top;
		dragBox_y2 -= rect.top;
		if (overlayBox.style.display != "none" && Math.abs(dragBox_x2 - dragBox_x1) > 2 && Math.abs(dragBox_y2 - dragBox_y1) > 2) {
			setTimeout(function () {
				offscreenCanvas.width = Math.abs(dragBox_x2 - dragBox_x1);
				offscreenCanvas.height = Math.abs(dragBox_y2 - dragBox_y1);
				oCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
				oCtx.drawImage(canvas, dragBox_x1, dragBox_y1, dragBox_x2 - dragBox_x1, dragBox_y2 - dragBox_y1, 0, 0, dragBox_x2 - dragBox_x1, dragBox_y2 - dragBox_y1);
				exportImageFromCanvas(offscreenCanvas);
				recognizeFromDataURL(offscreenCanvas.toDataURL("image/png"));
			}, 100);
		}
		// ctx.fillRect(dragBox_x1, dragBox_y1, dragBox_x2 - dragBox_x1, dragBox_y2 - dragBox_y1);
		overlayBox.style.display = "none";
	}
}

window.exportImageFromCanvas = function (c) {
	return;
	console.log("very yes");
	var dataURL = c.toDataURL("image/png");
	const link = document.createElement("a");
	link.href = dataURL;
	link.download = "my_canvas_image.png"; // Set the desired filename
	document.body.appendChild(link); // Temporarily add the link to the document
	link.click(); // Programmatically click the link to trigger download
	document.body.removeChild(link); // Remove the temporary link
}

addEventListener("mousemove", mouseMove);
addEventListener("touchmove", touchMove);

function touchMove(e) {
	for (var touch of e.touches) {
		if (touch.identifier == touchId) {
			mouseMove(touch);
		}
	}
}

function mouseMove(e) {
	if (isMouseDown) {
		var scaleFactor = 1;
		var dx = e[posName + "X"] - lastX;
		var dy = e[posName + "Y"] - lastY;
		dx /= currPageScale;
		dy /= currPageScale;
		lastX = e[posName + "X"];
		lastY = e[posName + "Y"];
		if (dragMode) {
			glMatrix.vec2.add(currPageTranslation, currPageTranslation, [scaleFactor * dx, scaleFactor * dy]);
		} else {
			dragBox_x1 = Math.min(e[posName + "X"], startX);
			dragBox_x2 = Math.max(e[posName + "X"], startX);
			dragBox_y1 = Math.min(e[posName + "Y"], startY);
			dragBox_y2 = Math.max(e[posName + "Y"], startY);
			overlayBox.style.left = dragBox_x1 + "px";
			overlayBox.style.top = dragBox_y1 + "px";
			overlayBox.style.width = Math.abs(dragBox_x2 - dragBox_x1) + "px";
			overlayBox.style.height = Math.abs(dragBox_y2 - dragBox_y1) + "px";
		}
		repaint();
	}
}

// zoom in and out
var scaleAmount = 1.3;

document.getElementById("zoomIn").addEventListener("click", function (e) {
	currPageScale *= scaleAmount;
	repaint();
	e.preventDefault();
	canvas.focus();
	this.blur();
});

document.getElementById("zoomOut").addEventListener("click", function (e) {
	currPageScale /= scaleAmount;
	repaint();
	e.preventDefault();
	canvas.focus();
	this.blur();
});

// next and prev page
document.getElementById("nextPage").addEventListener("click", function (e) {
	pageNumber++;
	repaint(true);
	e.preventDefault();
	canvas.focus();
	this.blur();
});

document.getElementById("prevPage").addEventListener("click", function (e) {
	pageNumber--;
	repaint(true);
	e.preventDefault();
	canvas.focus();
	this.blur();
});

function updateDragButton() {
	document.getElementById("modeToggle").innerHTML = (!dragMode) ? "&#9647;" : "&#129306;";
	// console.log("Drag mode: " + dragMode);
}

// select and similar
document.getElementById("modeToggle").addEventListener("click", function () {
	dragMode = !dragMode;
	updateDragButton();
})

addEventListener("keydown", function (e) {
	if (e.repeat) { return; }
	if (e.key == " ") {
		dragMode = !dragMode;
		updateDragButton();
	}
});

addEventListener("keyup", function (e) {
	if (e.key == " ") {
		dragMode = !dragMode;
		updateDragButton();
	}
});

function recognizeFromDataURL(dataURL) {
	(async () => {
		const ret = await worker.recognize(dataURL);
		let recognizedText = ret.data.text.trim().toLowerCase();
		if (recognizedText.length === 0) {
			recognizedText = "(No text recognized)";
		}
		// Show modal with recognized word
		const ocrModal = document.getElementById('ocrModal');
		const ocrModalText = document.getElementById('ocrModalText');
		ocrModalText.textContent = recognizedText || '(No text recognized)';
		ocrModal.style.display = 'flex';
		// word bank storage logic here
		const addBtn = document.getElementById('addToWordBankBtn');
		addBtn.onclick = function () {
			if (recognizedText === '(No text recognized)') {
				ocrModal.style.display = 'none';
				return;
			}
			// Load bank array
			let bank = [];
			try {
				const raw = localStorage.getItem('wordBank');
				bank = raw ? JSON.parse(raw) : [];
			} catch (e) {
				bank = [];
			}
			// Find or add
			const existing = bank.find(x => x.word === recognizedText);
			if (existing) {
				existing.count = (Number(existing.count) || 0) + 1;
			} else {
				bank.push({ word: recognizedText, count: 1 });
			}
			localStorage.setItem('wordBank', JSON.stringify(bank));
			console.log('Add to word bank clicked:', recognizedText);
			ocrModal.style.display = 'none'; // Close modal after adding
			if (typeof updateWordBankTab === 'function') updateWordBankTab();
		}
		const speakBtn = document.getElementById('speakWordBtn');
		if (recognizedText === '(No text recognized)') {
			speakBtn.style.display = 'none'; // Hide speak button if no text recognized
		}
		speakBtn.onclick = function () {
			const utterance = new SpeechSynthesisUtterance(recognizedText);
			utterance.lang = 'en-US'; // Set language as needed
			speechSynthesis.speak(utterance);
		}
	})();
}

// Modal close and button handlers
function onLoadFunction() {
	const ocrModal = document.getElementById('ocrModal');
	const closeBtn = document.getElementById('closeOcrModalBtn');
	if (closeBtn) {
		closeBtn.onclick = function () {
			ocrModal.style.display = 'none';
		};
	}
	const addBtn = document.getElementById('addToWordBankBtn');
	if (addBtn) {
		addBtn.onclick = function () {
			// Placeholder for future word bank logic
		};
	}
}

function updateWordBankTab() {
	// Updates the word bank tab with words stored under 'wordBank' key (JSON array)
	const container = document.getElementById('wordBankContainer');
	if (!container) return;

	// Remove previously-generated word cards (keep static elements like headings/placeholders)
	const existing = container.querySelectorAll('.wordCard.generated');
	existing.forEach(n => n.remove());

	let bank = [];
	try {
		const raw = localStorage.getItem('wordBank');
		bank = raw ? JSON.parse(raw) : [];
	} catch (e) {
		bank = [];
	}

	const placeholder = document.getElementById('bankEmptyPlaceholder');
	if (!bank.length) {
		if (placeholder) placeholder.style.display = 'block';
		return;
	}
	if (placeholder) placeholder.style.display = 'none';

	// Sort alphabetically for predictable order
	bank.sort((a, b) => a.word.localeCompare(b.word));

	// Render each word
	for (const entry of bank) {
		const card = document.createElement('div');
		card.className = 'wordCard generated';
		card.style.display = 'flex';
		card.style.alignItems = 'center';
		card.style.justifyContent = 'space-between';
		card.style.padding = '0.6em';
		card.style.margin = '0.4em 0';
		card.style.background = '#333';
		card.style.borderRadius = '6px';

		const p = document.createElement('p');
		p.style.color = 'white';
		p.style.fontSize = '1.1em';
		p.style.fontWeight = '600';
		p.style.margin = '0';
		p.textContent = entry.word;

		const counter = document.createElement('p');
		counter.textContent = entry.count ? ` ×${entry.count}` : '';
		counter.style.color = '#ccc';
		counter.style.fontSize = '1em';
		counter.style.background = "black";
		counter.style.borderRadius = '4px';
		counter.style.padding = '0.1em 0.4em';

		const removeBtn = document.createElement('button');
		removeBtn.textContent = '\u274C';
		removeBtn.title = 'Remove from word bank';
		removeBtn.onclick = function () {
			// Remove from array and persist
			const idx = bank.findIndex(x => x.word === entry.word);
			if (idx !== -1) {
				bank.splice(idx, 1);
				localStorage.setItem('wordBank', JSON.stringify(bank));
				updateWordBankTab();
			}
		};

		// left group holds counter and word text
		const leftGroup = document.createElement('div');
		leftGroup.style.display = 'flex';
		leftGroup.style.alignItems = 'center';
		leftGroup.style.gap = '0.6em';
		leftGroup.appendChild(counter);
		leftGroup.appendChild(p);

		// append left group and the remove button (right)
		card.appendChild(leftGroup);
		card.appendChild(removeBtn);
		container.appendChild(card);
	}
}

// expose for other modules / inline callers
window.updateWordBankTab = updateWordBankTab;

if (document.readyState === 'loading') {
	// The DOM is not ready yet, wait for it
	document.addEventListener('DOMContentLoaded', onLoadFunction);
} else {
	// The DOM is already ready, call the function immediately
	onLoadFunction();
}

function changeTab(tabIndex) {
	const tabs = document.querySelectorAll('.viewerTab');
	const navbarButtons = document.querySelectorAll('.navbarButton');
	tabs.forEach((tab, index) => {
		tab.style.display = (index === tabIndex) ? 'block' : 'none';
	});
	navbarButtons.forEach((button, index) => {
		button.classList.toggle('navbarButton-selected', index === tabIndex);
	});
	// If switching to Word Bank tab (index 1), update its contents
	if (tabIndex === 1 && typeof updateWordBankTab === 'function') {
		updateWordBankTab();
	}
}
window.changeTab = changeTab;