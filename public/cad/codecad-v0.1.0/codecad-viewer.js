import e, { cad_call as t, export_dwg_bytes as n, export_pdf_bytes as r, session_create as i, session_current as a, session_destroy as o, session_list as s, session_load_dwg as c, session_use as l, start_renderer as u, stop_renderer as d, yrs_apply_update as f, yrs_encode_update as p, yrs_pending_update as m, yrs_state_vector as h } from "./cadview-web.js";
//#region src/cad-api.ts
function g(e) {
	let t = JSON.parse(e);
	if (t && typeof t == "object" && "error" in t) throw Error(t.error);
	return t;
}
function _(e) {
	return typeof e == "string" ? e : e.id;
}
function v(e) {
	return e && typeof e == "object" && !Array.isArray(e) && "id" in e ? e.id : e;
}
function y(e) {
	return typeof e == "string" ? e : Array.isArray(e) ? e.map((e) => typeof e == "string" ? e : e.id) : e && typeof e == "object" && "id" in e ? e.id : e;
}
function b({ call: e, rpc: t, readFile: n }) {
	function r(t, n = {}) {
		return g(e(t, JSON.stringify(n)));
	}
	function i(e, n = {}) {
		let r = t(e, JSON.stringify(n));
		return typeof r == "string" ? g(r) : r.then(g);
	}
	return {
		describe: () => r("describe"),
		entities: (e) => r("entities", e || {}),
		entity: (e) => r("entity", { id: e }),
		children: (e) => r("children", { id: typeof e == "string" ? e : e.id }),
		near: (e, t) => r("near", {
			point: e,
			radius: t
		}),
		inBounds: (e, t) => r("inBounds", {
			rect: e,
			mode: t
		}),
		connectedTo: (e, t) => r("connectedTo", {
			id: typeof e == "string" ? e : e.id,
			...t == null ? {} : { tolerance: t }
		}),
		distance: (e, t) => r("distance", {
			a: e,
			b: t
		}),
		midpoint: (e, t) => r("midpoint", {
			a: e,
			b: t
		}),
		direction: (e, t) => r("direction", {
			a: e,
			b: t
		}),
		lineCircleIntersection: (e, t, n) => r("lineCircleIntersection", {
			line: e,
			center: t,
			radius: n
		}),
		circleCircleIntersection: (e, t, n, i) => r("circleCircleIntersection", {
			c1: e,
			r1: t,
			c2: n,
			r2: i
		}),
		projectOntoCircle: (e, t, n) => r("projectOntoCircle", {
			point: e,
			center: t,
			radius: n
		}),
		projectOnto: (e, t) => r("projectOnto", {
			point: e,
			line: t
		}),
		angleOf: (e, t) => r("angleOf", {
			point: e,
			center: t
		}),
		lineLineIntersection: (e, t, n = {}) => r("lineLineIntersection", {
			l1: v(e),
			l2: v(t),
			...n
		}),
		tangentLines: (e, t, n, i, a = "outer") => r("tangentLines", {
			c1: e,
			r1: t,
			c2: n,
			r2: i,
			kind: a
		}),
		tangentFromPoint: (e, t, n) => r("tangentFromPoint", {
			point: e,
			center: t,
			radius: n
		}),
		regionClip: (e, t, n = "intersect") => {
			let i = (e) => {
				if (!Array.isArray(e)) return v(e);
				let t = e[0];
				return Array.isArray(t) && typeof t[0] == "number" ? e : e.map(v);
			};
			return r("regionClip", {
				subject: i(e),
				clip: i(t),
				op: n
			});
		},
		addLayer: (e, t = {}) => r("addLayer", {
			name: e,
			...t
		}),
		addLine: (e, t, n = {}) => r("addLine", {
			start: e,
			end: t,
			...n
		}),
		addCircle: (e, t, n = {}) => r("addCircle", {
			center: e,
			radius: t,
			...n
		}),
		addArc: (e, t, n = {}) => r("addArc", {
			center: e,
			radius: t,
			...n
		}),
		addPolyline: (e, t = {}) => r("addPolyline", {
			points: e,
			...t
		}),
		addSpline: (e, t = {}) => r("addSpline", {
			points: e,
			...t
		}),
		addText: (e, t, n = {}) => r("addText", {
			text: e,
			at: t,
			...n
		}),
		measure: (e, t, n = {}) => r("measure", {
			from: e,
			to: t,
			...n
		}),
		dimRadius: (e, t = {}) => r("dimRadius", {
			...typeof e == "string" || "id" in e ? { id: _(e) } : e,
			...t
		}),
		dimDiameter: (e, t = {}) => r("dimDiameter", {
			...typeof e == "string" || "id" in e ? { id: _(e) } : e,
			...t
		}),
		dimAngle: (e, t, n, i = {}) => r("dimAngle", {
			center: e,
			p1: t,
			p2: n,
			...i
		}),
		addHatch: (e, t = {}) => r("addHatch", {
			boundary: v(e),
			...t,
			...t.holes ? { holes: t.holes.map(v) } : {}
		}),
		addFill: (e, t = {}) => r("addFill", {
			boundary: v(e),
			...t,
			...t.holes ? { holes: t.holes.map(v) } : {}
		}),
		defineBlock: (e, t, n = {}) => r("defineBlock", {
			name: e,
			shapes: t,
			...n
		}),
		place: (e, t) => r("place", {
			block: e,
			...t
		}),
		clone: (e, t, n = {}) => r("clone", {
			source: e,
			name: t,
			...n
		}),
		remove: (e) => r("remove", { target: y(e) }),
		move: (e, t, n) => r("move", {
			target: y(e),
			dx: t,
			dy: n
		}),
		copy: (e, t, n) => r("copy", {
			target: y(e),
			dx: t,
			dy: n
		}),
		rotate: (e, t, n) => r("rotate", {
			target: y(e),
			center: t,
			angle: n
		}),
		mirror: (e, t, n) => r("mirror", {
			target: y(e),
			p1: t,
			p2: n
		}),
		offset: (e, t) => r("offset", {
			id: typeof e == "string" ? e : e.id,
			distance: t
		}),
		trim: (e, t, n) => r("trim", {
			id: typeof e == "string" ? e : e.id,
			cut: t,
			keep: n
		}),
		trimTo: (e, t, n) => r("trimTo", {
			id: _(e),
			boundary: y(t),
			keep: n
		}),
		extendTo: (e, t, n = {}) => r("extendTo", {
			id: _(e),
			boundary: y(t),
			...n
		}),
		fillet: (e, t, n, i = {}) => r("fillet", {
			a: _(e),
			b: _(t),
			radius: n,
			...i
		}),
		chamfer: (e, t, n, i, a = {}) => r("chamfer", {
			a: _(e),
			b: _(t),
			d1: n,
			...i == null ? {} : { d2: i },
			...a
		}),
		array: (e, t) => r("array", {
			target: y(e),
			...t
		}),
		addLinetype: (e, t, n) => r("addLinetype", {
			name: e,
			pattern: t,
			...n
		}),
		linetypes: () => r("linetypes", {}),
		methods: () => r("methods", {}),
		aciColors: () => r("aciColors", {}),
		setLayerVisible: (e, t) => r("setLayerVisible", {
			name: e,
			visible: t
		}),
		fitView: () => r("fitView"),
		zoomTo: (e) => {
			if (e && typeof e == "object" && "bounds" in e && "id" in e) return r("zoomTo", { id: e.id });
			if (Array.isArray(e) && e.length > 0) {
				let t = Infinity, n = Infinity, i = -Infinity, a = -Infinity;
				for (let r of e) r.bounds?.min && (t = Math.min(t, r.bounds.min[0]), n = Math.min(n, r.bounds.min[1])), r.bounds?.max && (i = Math.max(i, r.bounds.max[0]), a = Math.max(a, r.bounds.max[1]));
				let o = Math.max(i - t, a - n) * .1 || 10;
				return r("zoomTo", { bounds: {
					min: [t - o, n - o],
					max: [i + o, a + o]
				} });
			}
			return r("zoomTo", e);
		},
		getView: () => r("getView"),
		clear: (e = {}) => r("clear", e),
		checkpoint: () => r("checkpoint"),
		undo: () => r("undo"),
		redo: () => r("redo"),
		save: (e = "cadview-output.json") => i("save", { path: e }),
		saveDwg: (e = "output.dwg") => i("saveDwg", { path: e }),
		savePdf: (e = "output.pdf") => i("savePdf", { path: e }),
		loadDwg: (e) => i("loadDwg", { path: e }),
		loadElmt: (e, t = {}) => i("loadElmt", {
			path: e,
			...t
		}),
		loadElmtDir: (e, t = {}) => i("loadElmtDir", {
			path: e,
			...t
		}),
		exec: (e, t = {}) => i("exec", {
			path: e,
			...t
		}),
		runScript: (e, t = {}) => i("runScript", {
			program: e,
			...t
		}),
		readFile: n ? (e) => n(e) : () => {
			throw Error("readFile not available in this environment");
		}
	};
}
//#endregion
//#region src/cad.ts
var x = /* @__PURE__ */ new Map(), S = null, C = !1;
function w() {
	C || (C = !0, queueMicrotask(T));
}
function T() {
	C = !1;
	let e = a();
	if (!e || e === "null") return;
	let t = JSON.parse(e);
	if (!t) return;
	let n = x.get(t);
	if (!n || n.closing) return;
	let r = m(t);
	r.byteLength > 0 && F(n.writer, r).catch((e) => console.warn(`[CodeCAD] Failed to send Yrs update for ${t}:`, e));
}
async function E() {
	C = !1;
	let e = a();
	if (!e || e === "null") return;
	let t = JSON.parse(e);
	if (!t) return;
	let n = x.get(t);
	if (!n || n.closing) return;
	let r = m(t);
	r.byteLength > 0 && (await F(n.writer, r), await new Promise((e) => setTimeout(e, 50)));
}
var D = null;
async function O(e, t = {}, n) {
	if (!D) throw Error("No WebTransport connection");
	let r = await D.createBidirectionalStream(), i = r.writable.getWriter(), a = new I(r.readable.getReader()), o = JSON.stringify({
		method: e,
		args: t,
		...n ? { doc_id: n } : {}
	});
	await F(i, new TextEncoder().encode(o));
	let s = await a.readMessage(), c = JSON.parse(new TextDecoder().decode(s));
	return i.close().catch(() => {}), c;
}
var k = {
	create(e) {
		let t = JSON.parse(i(e));
		if (t.error) throw Error(t.error);
		D && L(D, e).catch((t) => {
			console.warn(`[CodeCAD] Sync failed for '${e}':`, t);
		});
	},
	destroy(e) {
		let t = x.get(e);
		t && (t.closing = !0, t.writer.close().catch(() => {}), x.delete(e));
		let n = JSON.parse(o(e));
		if (n.error) throw Error(n.error);
	},
	list() {
		return JSON.parse(s());
	},
	loadDwgBytes(e, t) {
		let n = JSON.parse(c(e, t));
		if (n.error) throw Error(n.error);
		return n;
	}
}, A = "egui";
async function j() {
	if (typeof navigator > "u" || !("gpu" in navigator)) return "egui";
	try {
		return await navigator.gpu.requestAdapter() ? "vello" : "egui";
	} catch {
		return "egui";
	}
}
var M = {
	start(e, t) {
		let n = JSON.parse(u(e, t, A));
		if (n.error) throw Error(n.error);
		return n.key;
	},
	stop(e) {
		let t = JSON.parse(d(e));
		if (t.error) throw Error(t.error);
	},
	get rendererType() {
		return A;
	},
	setRendererType(e) {
		A = e, console.log(`[CodeCAD] Renderer set to: ${e}`);
	}
};
function N(e, t, n) {
	let r = new Blob([e], { type: n }), i = URL.createObjectURL(r), a = document.createElement("a");
	a.href = i, a.download = t, a.click(), URL.revokeObjectURL(i);
}
var P = {
	...b({
		call: (e, n) => {
			let r = t(e, n);
			return w(), r;
		},
		rpc: (e, t) => {
			let n = P.currentSession();
			return O(e, JSON.parse(t), n ?? void 0).then((e) => JSON.stringify(e));
		},
		readFile: null
	}),
	sessions: k,
	viewport: M,
	useSession(e) {
		let t = JSON.parse(l(e));
		if (t.error) throw Error(t.error);
	},
	currentSession() {
		let e = a();
		return JSON.parse(e);
	},
	save: async (e = "cadview-output.json") => {
		if (z) {
			await E();
			let t = P.currentSession(), n = await O("save", { path: e }, t ?? void 0);
			return t && S && S(t, e.replace(/\.[^.]+$/, "").split("/").pop() || e), n;
		}
		let t = P.entities();
		return N(JSON.stringify(t, null, 2), e, "application/json"), {
			ok: !0,
			path: e,
			entities: t.length
		};
	},
	saveDwg: async (e = "output.dwg") => {
		if (z) {
			await E();
			let t = P.currentSession(), n = await O("saveDwg", { path: e }, t ?? void 0);
			return t && S && S(t, e.replace(/\.[^.]+$/, "").split("/").pop() || e), n;
		}
		let t = P.currentSession();
		return t ? (N(n(t), e, "application/octet-stream"), {
			ok: !0,
			path: e
		}) : {
			ok: !1,
			error: "no session"
		};
	},
	savePdf: async (e = "output.pdf") => {
		if (z) {
			await E();
			let t = P.currentSession();
			return O("savePdf", { path: e }, t ?? void 0);
		}
		let t = P.currentSession();
		return t ? (N(r(t), e, "application/pdf"), {
			ok: !0,
			path: e
		}) : {
			ok: !1,
			error: "no session"
		};
	},
	api: { async listDocuments() {
		let e = window.__CADVIEW_TOKEN, t = {};
		e && (t.Authorization = `Bearer ${e}`);
		let n = await fetch("/api/documents", { headers: t });
		if (!n.ok) throw Error(`GET /api/documents: ${n.status}`);
		return n.json();
	} }
};
async function F(e, t) {
	let n = new Uint8Array(4 + t.byteLength);
	new DataView(n.buffer).setUint32(0, t.byteLength, !1), n.set(t, 4), await e.write(n);
}
var I = class {
	reader;
	buffer = new Uint8Array();
	constructor(e) {
		this.reader = e;
	}
	async fill(e) {
		for (; this.buffer.byteLength < e;) {
			let { value: e, done: t } = await this.reader.read();
			if (t) throw Error("stream closed");
			let n = new Uint8Array(e.buffer ?? e), r = new Uint8Array(this.buffer.byteLength + n.byteLength);
			r.set(this.buffer), r.set(n, this.buffer.byteLength), this.buffer = r;
		}
	}
	async readMessage() {
		await this.fill(4);
		let e = new DataView(this.buffer.buffer, this.buffer.byteOffset).getUint32(0, !1);
		await this.fill(4 + e);
		let t = this.buffer.slice(4, 4 + e);
		return this.buffer = this.buffer.slice(4 + e), t;
	}
};
async function L(e, t) {
	let n = await e.createBidirectionalStream(), r = n.writable.getWriter(), i = new I(n.readable.getReader()), a = JSON.stringify({
		type: "document",
		id: t
	});
	await F(r, new TextEncoder().encode(a)), await F(r, h(t)), f(t, await i.readMessage()), await F(r, p(t, await i.readMessage())), console.log(`[CodeCAD] Yrs sync complete for session '${t}'`);
	let o = {
		writer: r,
		reader: i,
		closing: !1
	};
	x.set(t, o), R(t, i);
}
async function R(e, t) {
	for (;;) try {
		let n = await t.readMessage();
		n.byteLength > 0 && f(e, n);
	} catch {
		x.delete(e);
		break;
	}
}
var z = !1;
function B(e) {
	let t = window.fetch;
	return window.fetch = async (n, r) => {
		let i = await t(n, r);
		if (!(n instanceof Request ? n.url : n.toString()).endsWith(".wasm")) return i;
		let a = Number.parseInt(i.headers.get("content-length") || "0", 10);
		if (!a || !i.body) return i;
		let o = i.body.getReader(), s = 0, c = new ReadableStream({ async pull(t) {
			let { done: n, value: r } = await o.read();
			if (n) {
				t.close();
				return;
			}
			s += r.length, e(Math.round(s / a * 100)), t.enqueue(r);
		} });
		return new Response(c, {
			headers: i.headers,
			status: i.status,
			statusText: i.statusText
		});
	}, () => {
		window.fetch = t;
	};
}
var V = null;
function H(e) {
	V = e;
}
async function U() {
	let t = B((e) => V?.(e));
	await e(), t(), A = await j();
}
//#endregion
//#region src/embed.ts
var W = null, G = 0, K = "\n:host {\n  display: block;\n  position: relative;\n  overflow: hidden;\n  background: #0a0e14;\n}\ncanvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n  cursor: crosshair;\n}\n.badge {\n  position: absolute;\n  bottom: 6px;\n  right: 8px;\n  font: 10px/1 \"JetBrains Mono\", monospace;\n  color: #6b7280;\n  text-decoration: none;\n  opacity: 0.6;\n  pointer-events: auto;\n  user-select: none;\n  z-index: 1;\n}\n.badge:hover { opacity: 1; }\n.hint {\n  position: absolute;\n  bottom: 6px;\n  left: 50%;\n  transform: translateX(-50%);\n  font: 11px/1 \"JetBrains Mono\", monospace;\n  color: #e8e8e8;\n  background: rgba(10, 14, 20, 0.85);\n  padding: 4px 10px;\n  border-radius: 3px;\n  opacity: 0;\n  pointer-events: none;\n  z-index: 1;\n  transition: opacity 0.3s;\n}\n.hint.show {\n  animation: hint-fade 2.5s ease-out forwards;\n}\n@keyframes hint-fade {\n  0% { opacity: 0; }\n  10% { opacity: 1; }\n  70% { opacity: 1; }\n  100% { opacity: 0; }\n}\n.loading {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n}\n.loading svg {\n  width: 48px;\n  height: 48px;\n}\n.loading line, .loading circle {\n  fill: none;\n  stroke: #ffb000;\n  stroke-width: 1.2;\n}\n.loading .lv {\n  stroke-dasharray: 80;\n  stroke-dashoffset: 80;\n  animation: ld 1.2s ease-out forwards, lp 2.4s ease-in-out 1.2s infinite;\n}\n.loading .lh {\n  stroke-dasharray: 80;\n  stroke-dashoffset: 80;\n  animation: ld 1.2s ease-out 0.15s forwards, lp 2.4s ease-in-out 1.35s infinite;\n}\n.loading .lc {\n  stroke-dasharray: 63;\n  stroke-dashoffset: 63;\n  animation: ld 0.8s ease-out 0.6s forwards, lp 2.4s ease-in-out 1.4s infinite;\n}\n@keyframes ld { to { stroke-dashoffset: 0; } }\n@keyframes lp { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }\n.loading span {\n  font: 10px/1 \"JetBrains Mono\", monospace;\n  color: #6b7280;\n  letter-spacing: 0.1em;\n}\n.error {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font: 11px/1 \"JetBrains Mono\", monospace;\n  color: #6b7280;\n  padding: 16px;\n  text-align: center;\n}\n", q = class extends HTMLElement {
	static observedAttributes = ["src"];
	shadow;
	canvas;
	hint;
	loadingEl;
	sessionId = "";
	rendererKey = "";
	observer = null;
	initialized = !1;
	hintShown = !1;
	constructor() {
		super(), this.shadow = this.attachShadow({ mode: "open" });
		let e = document.createElement("style");
		e.textContent = K, this.canvas = document.createElement("canvas");
		let t = document.createElement("a");
		t.className = "badge", t.textContent = "CodeCAD", t.href = "https://github.com/backkem/codecad", t.target = "_blank", t.rel = "noopener", this.hint = document.createElement("div"), this.hint.className = "hint", this.hint.textContent = "drag to pan · scroll to zoom", this.loadingEl = document.createElement("div"), this.loadingEl.className = "loading", this.loadingEl.innerHTML = "<svg viewBox=\"0 0 80 80\"><line x1=\"40\" y1=\"0\" x2=\"40\" y2=\"80\" class=\"lv\"/><line x1=\"0\" y1=\"40\" x2=\"80\" y2=\"40\" class=\"lh\"/><circle cx=\"40\" cy=\"40\" r=\"10\" class=\"lc\"/></svg><span>loading</span>", this.shadow.append(e, this.canvas, t, this.hint, this.loadingEl);
	}
	connectedCallback() {
		this.sessionId = `embed_${G++}`, this.addEventListener("mouseenter", this.onFirstHover, { once: !0 }), this.observer = new IntersectionObserver((e) => {
			e[0]?.isIntersecting && (this.observer?.disconnect(), this.observer = null, this.initViewer());
		}, { rootMargin: "200px" }), this.observer.observe(this);
	}
	disconnectedCallback() {
		this.observer?.disconnect(), this.removeEventListener("mouseenter", this.onFirstHover), this.cleanup();
	}
	attributeChangedCallback(e, t, n) {
		e === "src" && t !== n && this.initialized && this.loadSrc(n);
	}
	onFirstHover = () => {
		this.hintShown || (this.hintShown = !0, this.hint.classList.add("show"));
	};
	async initViewer() {
		if (!W) {
			let e = this.loadingEl.querySelector("span");
			H((t) => {
				e && (e.textContent = `loading ${t}%`);
			}), W = U();
		}
		await W, i(this.sessionId), l(this.sessionId);
		let e = JSON.parse(u(this.canvas, this.sessionId, "vello"));
		if (e.error) {
			let e = JSON.parse(u(this.canvas, this.sessionId, "egui"));
			this.rendererKey = e.key ?? "";
		} else this.rendererKey = e.key;
		this.initialized = !0, await this.loadSrc(this.getAttribute("src"));
	}
	async loadSrc(e) {
		if (!e) {
			this.loadingEl.style.display = "none";
			return;
		}
		this.loadingEl.style.display = "flex";
		try {
			let n = await fetch(e);
			if (!n.ok) throw Error(`${n.status} ${n.statusText}`);
			let r = await n.arrayBuffer();
			l(this.sessionId), c(this.sessionId, new Uint8Array(r)), t("fitView", "{}"), this.loadingEl.style.display = "none";
		} catch (e) {
			this.loadingEl.className = "error", this.loadingEl.textContent = `Failed to load: ${e}`;
		}
	}
	cleanup() {
		if (this.rendererKey) {
			try {
				d(this.rendererKey);
			} catch {}
			this.rendererKey = "";
		}
		if (this.sessionId) {
			try {
				o(this.sessionId);
			} catch {}
			this.sessionId = "";
		}
		this.initialized = !1;
	}
};
customElements.define("codecad-viewer", q);
//#endregion
