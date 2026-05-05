import Et, { app as x, dialog as ye, BrowserWindow as rt, ipcMain as S } from "electron";
import { readFile as M, writeFile as q, access as A, mkdir as F, stat as xt, readdir as be, copyFile as Te, chmod as Ae, rm as St } from "node:fs/promises";
import { constants as L, createWriteStream as it } from "node:fs";
import { dirname as D, resolve as Ee, join as f, extname as Pt, basename as Tt, relative as At } from "node:path";
import { fileURLToPath as st } from "node:url";
import { tmpdir as ot } from "node:os";
import { pipeline as at } from "node:stream/promises";
import { spawn as z } from "node:child_process";
import $ from "path";
import Lt from "child_process";
import W from "os";
import I from "fs";
import Ot from "util";
import ct from "events";
import Ft from "http";
import Dt from "https";
function kt(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var B, Le;
function _t() {
  if (Le) return B;
  Le = 1;
  const r = I, i = $;
  B = {
    findAndReadPackageJson: n,
    tryReadJsonAt: s
  };
  function n() {
    return s(t()) || s(a()) || s(process.resourcesPath, "app.asar") || s(process.resourcesPath, "app") || s(process.cwd()) || { name: void 0, version: void 0 };
  }
  function s(...o) {
    if (o[0])
      try {
        const c = i.join(...o), l = e("package.json", c);
        if (!l)
          return;
        const u = JSON.parse(r.readFileSync(l, "utf8")), p = u?.productName || u?.name;
        return !p || p.toLowerCase() === "electron" ? void 0 : p ? { name: p, version: u?.version } : void 0;
      } catch {
        return;
      }
  }
  function e(o, c) {
    let l = c;
    for (; ; ) {
      const u = i.parse(l), p = u.root, d = u.dir;
      if (r.existsSync(i.join(l, o)))
        return i.resolve(i.join(l, o));
      if (l === p)
        return null;
      l = d;
    }
  }
  function a() {
    const o = process.argv.filter((l) => l.indexOf("--user-data-dir=") === 0);
    return o.length === 0 || typeof o[0] != "string" ? null : o[0].replace("--user-data-dir=", "");
  }
  function t() {
    try {
      return require.main?.filename;
    } catch {
      return;
    }
  }
  return B;
}
var J, Oe;
function $t() {
  if (Oe) return J;
  Oe = 1;
  const r = Lt, i = W, n = $, s = _t();
  class e {
    appName = void 0;
    appPackageJson = void 0;
    platform = process.platform;
    getAppLogPath(t = this.getAppName()) {
      return this.platform === "darwin" ? n.join(this.getSystemPathHome(), "Library/Logs", t) : n.join(this.getAppUserDataPath(t), "logs");
    }
    getAppName() {
      const t = this.appName || this.getAppPackageJson()?.name;
      if (!t)
        throw new Error(
          "electron-log can't determine the app name. It tried these methods:\n1. Use `electron.app.name`\n2. Use productName or name from the nearest package.json`\nYou can also set it through log.transports.file.setAppName()"
        );
      return t;
    }
    /**
     * @private
     * @returns {undefined}
     */
    getAppPackageJson() {
      return typeof this.appPackageJson != "object" && (this.appPackageJson = s.findAndReadPackageJson()), this.appPackageJson;
    }
    getAppUserDataPath(t = this.getAppName()) {
      return t ? n.join(this.getSystemPathAppData(), t) : void 0;
    }
    getAppVersion() {
      return this.getAppPackageJson()?.version;
    }
    getElectronLogPath() {
      return this.getAppLogPath();
    }
    getMacOsVersion() {
      const t = Number(i.release().split(".")[0]);
      return t <= 19 ? `10.${t - 4}` : t - 9;
    }
    /**
     * @protected
     * @returns {string}
     */
    getOsVersion() {
      let t = i.type().replace("_", " "), o = i.release();
      return t === "Darwin" && (t = "macOS", o = this.getMacOsVersion()), `${t} ${o}`;
    }
    /**
     * @return {PathVariables}
     */
    getPathVariables() {
      const t = this.getAppName(), o = this.getAppVersion(), c = this;
      return {
        appData: this.getSystemPathAppData(),
        appName: t,
        appVersion: o,
        get electronDefaultDir() {
          return c.getElectronLogPath();
        },
        home: this.getSystemPathHome(),
        libraryDefaultDir: this.getAppLogPath(t),
        libraryTemplate: this.getAppLogPath("{appName}"),
        temp: this.getSystemPathTemp(),
        userData: this.getAppUserDataPath(t)
      };
    }
    getSystemPathAppData() {
      const t = this.getSystemPathHome();
      switch (this.platform) {
        case "darwin":
          return n.join(t, "Library/Application Support");
        case "win32":
          return process.env.APPDATA || n.join(t, "AppData/Roaming");
        default:
          return process.env.XDG_CONFIG_HOME || n.join(t, ".config");
      }
    }
    getSystemPathHome() {
      return i.homedir?.() || process.env.HOME;
    }
    getSystemPathTemp() {
      return i.tmpdir();
    }
    getVersions() {
      return {
        app: `${this.getAppName()} ${this.getAppVersion()}`,
        electron: void 0,
        os: this.getOsVersion()
      };
    }
    isDev() {
      return process.env.NODE_ENV === "development" || process.env.ELECTRON_IS_DEV === "1";
    }
    isElectron() {
      return !!process.versions.electron;
    }
    onAppEvent(t, o) {
    }
    onAppReady(t) {
      t();
    }
    onEveryWebContentsEvent(t, o) {
    }
    /**
     * Listen to async messages sent from opposite process
     * @param {string} channel
     * @param {function} listener
     */
    onIpc(t, o) {
    }
    onIpcInvoke(t, o) {
    }
    /**
     * @param {string} url
     * @param {Function} [logFunction]
     */
    openUrl(t, o = console.error) {
      const l = { darwin: "open", win32: "start", linux: "xdg-open" }[process.platform] || "xdg-open";
      r.exec(`${l} ${t}`, {}, (u) => {
        u && o(u);
      });
    }
    setAppName(t) {
      this.appName = t;
    }
    setPlatform(t) {
      this.platform = t;
    }
    setPreloadFileForSessions({
      filePath: t,
      // eslint-disable-line no-unused-vars
      includeFutureSession: o = !0,
      // eslint-disable-line no-unused-vars
      getSessions: c = () => []
      // eslint-disable-line no-unused-vars
    }) {
    }
    /**
     * Sent a message to opposite process
     * @param {string} channel
     * @param {any} message
     */
    sendIpc(t, o) {
    }
    showErrorBox(t, o) {
    }
  }
  return J = e, J;
}
var V, Fe;
function jt() {
  if (Fe) return V;
  Fe = 1;
  const r = $, i = $t();
  class n extends i {
    /**
     * @type {typeof Electron}
     */
    electron = void 0;
    /**
     * @param {object} options
     * @param {typeof Electron} [options.electron]
     */
    constructor({ electron: e } = {}) {
      super(), this.electron = e;
    }
    getAppName() {
      let e;
      try {
        e = this.appName || this.electron.app?.name || this.electron.app?.getName();
      } catch {
      }
      return e || super.getAppName();
    }
    getAppUserDataPath(e) {
      return this.getPath("userData") || super.getAppUserDataPath(e);
    }
    getAppVersion() {
      let e;
      try {
        e = this.electron.app?.getVersion();
      } catch {
      }
      return e || super.getAppVersion();
    }
    getElectronLogPath() {
      return this.getPath("logs") || super.getElectronLogPath();
    }
    /**
     * @private
     * @param {any} name
     * @returns {string|undefined}
     */
    getPath(e) {
      try {
        return this.electron.app?.getPath(e);
      } catch {
        return;
      }
    }
    getVersions() {
      return {
        app: `${this.getAppName()} ${this.getAppVersion()}`,
        electron: `Electron ${process.versions.electron}`,
        os: this.getOsVersion()
      };
    }
    getSystemPathAppData() {
      return this.getPath("appData") || super.getSystemPathAppData();
    }
    isDev() {
      return this.electron.app?.isPackaged !== void 0 ? !this.electron.app.isPackaged : typeof process.execPath == "string" ? r.basename(process.execPath).toLowerCase().startsWith("electron") : super.isDev();
    }
    onAppEvent(e, a) {
      return this.electron.app?.on(e, a), () => {
        this.electron.app?.off(e, a);
      };
    }
    onAppReady(e) {
      this.electron.app?.isReady() ? e() : this.electron.app?.once ? this.electron.app?.once("ready", e) : e();
    }
    onEveryWebContentsEvent(e, a) {
      return this.electron.webContents?.getAllWebContents()?.forEach((o) => {
        o.on(e, a);
      }), this.electron.app?.on("web-contents-created", t), () => {
        this.electron.webContents?.getAllWebContents().forEach((o) => {
          o.off(e, a);
        }), this.electron.app?.off("web-contents-created", t);
      };
      function t(o, c) {
        c.on(e, a);
      }
    }
    /**
     * Listen to async messages sent from opposite process
     * @param {string} channel
     * @param {function} listener
     */
    onIpc(e, a) {
      this.electron.ipcMain?.on(e, a);
    }
    onIpcInvoke(e, a) {
      this.electron.ipcMain?.handle?.(e, a);
    }
    /**
     * @param {string} url
     * @param {Function} [logFunction]
     */
    openUrl(e, a = console.error) {
      this.electron.shell?.openExternal(e).catch(a);
    }
    setPreloadFileForSessions({
      filePath: e,
      includeFutureSession: a = !0,
      getSessions: t = () => [this.electron.session?.defaultSession]
    }) {
      for (const c of t().filter(Boolean))
        o(c);
      a && this.onAppEvent("session-created", (c) => {
        o(c);
      });
      function o(c) {
        typeof c.registerPreloadScript == "function" ? c.registerPreloadScript({
          filePath: e,
          id: "electron-log-preload",
          type: "frame"
        }) : c.setPreloads([...c.getPreloads(), e]);
      }
    }
    /**
     * Sent a message to opposite process
     * @param {string} channel
     * @param {any} message
     */
    sendIpc(e, a) {
      this.electron.BrowserWindow?.getAllWindows()?.forEach((t) => {
        t.webContents?.isDestroyed() === !1 && t.webContents?.isCrashed() === !1 && t.webContents.send(e, a);
      });
    }
    showErrorBox(e, a) {
      this.electron.dialog?.showErrorBox(e, a);
    }
  }
  return V = n, V;
}
var G = { exports: {} }, De;
function Ct() {
  return De || (De = 1, (function(r) {
    let i = {};
    try {
      i = require("electron");
    } catch {
    }
    i.ipcRenderer && n(i), r.exports = n;
    function n({ contextBridge: s, ipcRenderer: e }) {
      if (!e)
        return;
      e.on("__ELECTRON_LOG_IPC__", (t, o) => {
        window.postMessage({ cmd: "message", ...o });
      }), e.invoke("__ELECTRON_LOG__", { cmd: "getOptions" }).catch((t) => console.error(new Error(
        `electron-log isn't initialized in the main process. Please call log.initialize() before. ${t.message}`
      )));
      const a = {
        sendToMain(t) {
          try {
            e.send("__ELECTRON_LOG__", t);
          } catch (o) {
            console.error("electronLog.sendToMain ", o, "data:", t), e.send("__ELECTRON_LOG__", {
              cmd: "errorHandler",
              error: { message: o?.message, stack: o?.stack },
              errorName: "sendToMain"
            });
          }
        },
        log(...t) {
          a.sendToMain({ data: t, level: "info" });
        }
      };
      for (const t of ["error", "warn", "info", "verbose", "debug", "silly"])
        a[t] = (...o) => a.sendToMain({
          data: o,
          level: t
        });
      if (s && process.contextIsolated)
        try {
          s.exposeInMainWorld("__electronLog", a);
        } catch {
        }
      typeof window == "object" ? window.__electronLog = a : __electronLog = a;
    }
  })(G)), G.exports;
}
var K, ke;
function Rt() {
  if (ke) return K;
  ke = 1;
  const r = I, i = W, n = $, s = Ct();
  let e = !1, a = !1;
  K = {
    initialize({
      externalApi: c,
      getSessions: l,
      includeFutureSession: u,
      logger: p,
      preload: d = !0,
      spyRendererConsole: g = !1
    }) {
      c.onAppReady(() => {
        try {
          d && t({
            externalApi: c,
            getSessions: l,
            includeFutureSession: u,
            logger: p,
            preloadOption: d
          }), g && o({ externalApi: c, logger: p });
        } catch (b) {
          p.warn(b);
        }
      });
    }
  };
  function t({
    externalApi: c,
    getSessions: l,
    includeFutureSession: u,
    logger: p,
    preloadOption: d
  }) {
    let g = typeof d == "string" ? d : void 0;
    if (e) {
      p.warn(new Error("log.initialize({ preload }) already called").stack);
      return;
    }
    e = !0;
    try {
      g = n.resolve(
        __dirname,
        "../renderer/electron-log-preload.js"
      );
    } catch {
    }
    if (!g || !r.existsSync(g)) {
      g = n.join(
        c.getAppUserDataPath() || i.tmpdir(),
        "electron-log-preload.js"
      );
      const b = `
      try {
        (${s.toString()})(require('electron'));
      } catch(e) {
        console.error(e);
      }
    `;
      r.writeFileSync(g, b, "utf8");
    }
    c.setPreloadFileForSessions({
      filePath: g,
      includeFutureSession: u,
      getSessions: l
    });
  }
  function o({ externalApi: c, logger: l }) {
    if (a) {
      l.warn(
        new Error("log.initialize({ spyRendererConsole }) already called").stack
      );
      return;
    }
    a = !0;
    const u = ["debug", "info", "warn", "error"];
    c.onEveryWebContentsEvent(
      "console-message",
      (p, d, g) => {
        l.processMessage({
          data: [g],
          level: u[d],
          variables: { processType: "renderer" }
        });
      }
    );
  }
  return K;
}
var Y, _e;
function It() {
  if (_e) return Y;
  _e = 1, Y = r;
  function r(i) {
    return Object.defineProperties(n, {
      defaultLabel: { value: "", writable: !0 },
      labelPadding: { value: !0, writable: !0 },
      maxLabelLength: { value: 0, writable: !0 },
      labelLength: {
        get() {
          switch (typeof n.labelPadding) {
            case "boolean":
              return n.labelPadding ? n.maxLabelLength : 0;
            case "number":
              return n.labelPadding;
            default:
              return 0;
          }
        }
      }
    });
    function n(s) {
      n.maxLabelLength = Math.max(n.maxLabelLength, s.length);
      const e = {};
      for (const a of i.levels)
        e[a] = (...t) => i.logData(t, { level: a, scope: s });
      return e.log = e.info, e;
    }
  }
  return Y;
}
var Q, $e;
function Nt() {
  if ($e) return Q;
  $e = 1;
  class r {
    constructor({ processMessage: n }) {
      this.processMessage = n, this.buffer = [], this.enabled = !1, this.begin = this.begin.bind(this), this.commit = this.commit.bind(this), this.reject = this.reject.bind(this);
    }
    addMessage(n) {
      this.buffer.push(n);
    }
    begin() {
      this.enabled = [];
    }
    commit() {
      this.enabled = !1, this.buffer.forEach((n) => this.processMessage(n)), this.buffer = [];
    }
    reject() {
      this.enabled = !1, this.buffer = [];
    }
  }
  return Q = r, Q;
}
var Z, je;
function Mt() {
  if (je) return Z;
  je = 1;
  const r = It(), i = Nt();
  class n {
    static instances = {};
    dependencies = {};
    errorHandler = null;
    eventLogger = null;
    functions = {};
    hooks = [];
    isDev = !1;
    levels = null;
    logId = null;
    scope = null;
    transports = {};
    variables = {};
    constructor({
      allowUnknownLevel: e = !1,
      dependencies: a = {},
      errorHandler: t,
      eventLogger: o,
      initializeFn: c,
      isDev: l = !1,
      levels: u = ["error", "warn", "info", "verbose", "debug", "silly"],
      logId: p,
      transportFactories: d = {},
      variables: g
    } = {}) {
      this.addLevel = this.addLevel.bind(this), this.create = this.create.bind(this), this.initialize = this.initialize.bind(this), this.logData = this.logData.bind(this), this.processMessage = this.processMessage.bind(this), this.allowUnknownLevel = e, this.buffering = new i(this), this.dependencies = a, this.initializeFn = c, this.isDev = l, this.levels = u, this.logId = p, this.scope = r(this), this.transportFactories = d, this.variables = g || {};
      for (const b of this.levels)
        this.addLevel(b, !1);
      this.log = this.info, this.functions.log = this.log, this.errorHandler = t, t?.setOptions({ ...a, logFn: this.error }), this.eventLogger = o, o?.setOptions({ ...a, logger: this });
      for (const [b, m] of Object.entries(d))
        this.transports[b] = m(this, a);
      n.instances[p] = this;
    }
    static getInstance({ logId: e }) {
      return this.instances[e] || this.instances.default;
    }
    addLevel(e, a = this.levels.length) {
      a !== !1 && this.levels.splice(a, 0, e), this[e] = (...t) => this.logData(t, { level: e }), this.functions[e] = this[e];
    }
    catchErrors(e) {
      return this.processMessage(
        {
          data: ["log.catchErrors is deprecated. Use log.errorHandler instead"],
          level: "warn"
        },
        { transports: ["console"] }
      ), this.errorHandler.startCatching(e);
    }
    create(e) {
      return typeof e == "string" && (e = { logId: e }), new n({
        dependencies: this.dependencies,
        errorHandler: this.errorHandler,
        initializeFn: this.initializeFn,
        isDev: this.isDev,
        transportFactories: this.transportFactories,
        variables: { ...this.variables },
        ...e
      });
    }
    compareLevels(e, a, t = this.levels) {
      const o = t.indexOf(e), c = t.indexOf(a);
      return c === -1 || o === -1 ? !0 : c <= o;
    }
    initialize(e = {}) {
      this.initializeFn({ logger: this, ...this.dependencies, ...e });
    }
    logData(e, a = {}) {
      this.buffering.enabled ? this.buffering.addMessage({ data: e, date: /* @__PURE__ */ new Date(), ...a }) : this.processMessage({ data: e, ...a });
    }
    processMessage(e, { transports: a = this.transports } = {}) {
      if (e.cmd === "errorHandler") {
        this.errorHandler.handle(e.error, {
          errorName: e.errorName,
          processType: "renderer",
          showDialog: !!e.showDialog
        });
        return;
      }
      let t = e.level;
      this.allowUnknownLevel || (t = this.levels.includes(e.level) ? e.level : "info");
      const o = {
        date: /* @__PURE__ */ new Date(),
        logId: this.logId,
        ...e,
        level: t,
        variables: {
          ...this.variables,
          ...e.variables
        }
      };
      for (const [c, l] of this.transportEntries(a))
        if (!(typeof l != "function" || l.level === !1) && this.compareLevels(l.level, e.level))
          try {
            const u = this.hooks.reduce((p, d) => p && d(p, l, c), o);
            u && l({ ...u, data: [...u.data] });
          } catch (u) {
            this.processInternalErrorFn(u);
          }
    }
    processInternalErrorFn(e) {
    }
    transportEntries(e = this.transports) {
      return (Array.isArray(e) ? e : Object.entries(e)).map((t) => {
        switch (typeof t) {
          case "string":
            return this.transports[t] ? [t, this.transports[t]] : null;
          case "function":
            return [t.name, t];
          default:
            return Array.isArray(t) ? t : null;
        }
      }).filter(Boolean);
    }
  }
  return Z = n, Z;
}
var ee, Ce;
function qt() {
  if (Ce) return ee;
  Ce = 1;
  class r {
    externalApi = void 0;
    isActive = !1;
    logFn = void 0;
    onError = void 0;
    showDialog = !0;
    constructor({
      externalApi: s,
      logFn: e = void 0,
      onError: a = void 0,
      showDialog: t = void 0
    } = {}) {
      this.createIssue = this.createIssue.bind(this), this.handleError = this.handleError.bind(this), this.handleRejection = this.handleRejection.bind(this), this.setOptions({ externalApi: s, logFn: e, onError: a, showDialog: t }), this.startCatching = this.startCatching.bind(this), this.stopCatching = this.stopCatching.bind(this);
    }
    handle(s, {
      logFn: e = this.logFn,
      onError: a = this.onError,
      processType: t = "browser",
      showDialog: o = this.showDialog,
      errorName: c = ""
    } = {}) {
      s = i(s);
      try {
        if (typeof a == "function") {
          const l = this.externalApi?.getVersions() || {}, u = this.createIssue;
          if (a({
            createIssue: u,
            error: s,
            errorName: c,
            processType: t,
            versions: l
          }) === !1)
            return;
        }
        c ? e(c, s) : e(s), o && !c.includes("rejection") && this.externalApi && this.externalApi.showErrorBox(
          `A JavaScript error occurred in the ${t} process`,
          s.stack
        );
      } catch {
        console.error(s);
      }
    }
    setOptions({ externalApi: s, logFn: e, onError: a, showDialog: t }) {
      typeof s == "object" && (this.externalApi = s), typeof e == "function" && (this.logFn = e), typeof a == "function" && (this.onError = a), typeof t == "boolean" && (this.showDialog = t);
    }
    startCatching({ onError: s, showDialog: e } = {}) {
      this.isActive || (this.isActive = !0, this.setOptions({ onError: s, showDialog: e }), process.on("uncaughtException", this.handleError), process.on("unhandledRejection", this.handleRejection));
    }
    stopCatching() {
      this.isActive = !1, process.removeListener("uncaughtException", this.handleError), process.removeListener("unhandledRejection", this.handleRejection);
    }
    createIssue(s, e) {
      this.externalApi?.openUrl(
        `${s}?${new URLSearchParams(e).toString()}`
      );
    }
    handleError(s) {
      this.handle(s, { errorName: "Unhandled" });
    }
    handleRejection(s) {
      const e = s instanceof Error ? s : new Error(JSON.stringify(s));
      this.handle(e, { errorName: "Unhandled rejection" });
    }
  }
  function i(n) {
    if (n instanceof Error)
      return n;
    if (n && typeof n == "object") {
      if (n.message)
        return Object.assign(new Error(n.message), n);
      try {
        return new Error(JSON.stringify(n));
      } catch (s) {
        return new Error(`Couldn't normalize error ${String(n)}: ${s}`);
      }
    }
    return new Error(`Can't normalize error ${String(n)}`);
  }
  return ee = r, ee;
}
var te, Re;
function zt() {
  if (Re) return te;
  Re = 1;
  class r {
    disposers = [];
    format = "{eventSource}#{eventName}:";
    formatters = {
      app: {
        "certificate-error": ({ args: n }) => this.arrayToObject(n.slice(1, 4), [
          "url",
          "error",
          "certificate"
        ]),
        "child-process-gone": ({ args: n }) => n.length === 1 ? n[0] : n,
        "render-process-gone": ({ args: [n, s] }) => s && typeof s == "object" ? { ...s, ...this.getWebContentsDetails(n) } : []
      },
      webContents: {
        "console-message": ({ args: [n, s, e, a] }) => {
          if (!(n < 3))
            return { message: s, source: `${a}:${e}` };
        },
        "did-fail-load": ({ args: n }) => this.arrayToObject(n, [
          "errorCode",
          "errorDescription",
          "validatedURL",
          "isMainFrame",
          "frameProcessId",
          "frameRoutingId"
        ]),
        "did-fail-provisional-load": ({ args: n }) => this.arrayToObject(n, [
          "errorCode",
          "errorDescription",
          "validatedURL",
          "isMainFrame",
          "frameProcessId",
          "frameRoutingId"
        ]),
        "plugin-crashed": ({ args: n }) => this.arrayToObject(n, ["name", "version"]),
        "preload-error": ({ args: n }) => this.arrayToObject(n, ["preloadPath", "error"])
      }
    };
    events = {
      app: {
        "certificate-error": !0,
        "child-process-gone": !0,
        "render-process-gone": !0
      },
      webContents: {
        // 'console-message': true,
        "did-fail-load": !0,
        "did-fail-provisional-load": !0,
        "plugin-crashed": !0,
        "preload-error": !0,
        unresponsive: !0
      }
    };
    externalApi = void 0;
    level = "error";
    scope = "";
    constructor(n = {}) {
      this.setOptions(n);
    }
    setOptions({
      events: n,
      externalApi: s,
      level: e,
      logger: a,
      format: t,
      formatters: o,
      scope: c
    }) {
      typeof n == "object" && (this.events = n), typeof s == "object" && (this.externalApi = s), typeof e == "string" && (this.level = e), typeof a == "object" && (this.logger = a), (typeof t == "string" || typeof t == "function") && (this.format = t), typeof o == "object" && (this.formatters = o), typeof c == "string" && (this.scope = c);
    }
    startLogging(n = {}) {
      this.setOptions(n), this.disposeListeners();
      for (const s of this.getEventNames(this.events.app))
        this.disposers.push(
          this.externalApi.onAppEvent(s, (...e) => {
            this.handleEvent({ eventSource: "app", eventName: s, handlerArgs: e });
          })
        );
      for (const s of this.getEventNames(this.events.webContents))
        this.disposers.push(
          this.externalApi.onEveryWebContentsEvent(
            s,
            (...e) => {
              this.handleEvent(
                { eventSource: "webContents", eventName: s, handlerArgs: e }
              );
            }
          )
        );
    }
    stopLogging() {
      this.disposeListeners();
    }
    arrayToObject(n, s) {
      const e = {};
      return s.forEach((a, t) => {
        e[a] = n[t];
      }), n.length > s.length && (e.unknownArgs = n.slice(s.length)), e;
    }
    disposeListeners() {
      this.disposers.forEach((n) => n()), this.disposers = [];
    }
    formatEventLog({ eventName: n, eventSource: s, handlerArgs: e }) {
      const [a, ...t] = e;
      if (typeof this.format == "function")
        return this.format({ args: t, event: a, eventName: n, eventSource: s });
      const o = this.formatters[s]?.[n];
      let c = t;
      if (typeof o == "function" && (c = o({ args: t, event: a, eventName: n, eventSource: s })), !c)
        return;
      const l = {};
      return Array.isArray(c) ? l.args = c : typeof c == "object" && Object.assign(l, c), s === "webContents" && Object.assign(l, this.getWebContentsDetails(a?.sender)), [this.format.replace("{eventSource}", s === "app" ? "App" : "WebContents").replace("{eventName}", n), l];
    }
    getEventNames(n) {
      return !n || typeof n != "object" ? [] : Object.entries(n).filter(([s, e]) => e).map(([s]) => s);
    }
    getWebContentsDetails(n) {
      if (!n?.loadURL)
        return {};
      try {
        return {
          webContents: {
            id: n.id,
            url: n.getURL()
          }
        };
      } catch {
        return {};
      }
    }
    handleEvent({ eventName: n, eventSource: s, handlerArgs: e }) {
      const a = this.formatEventLog({ eventName: n, eventSource: s, handlerArgs: e });
      a && (this.scope ? this.logger.scope(this.scope) : this.logger)?.[this.level]?.(...a);
    }
  }
  return te = r, te;
}
var ne, Ie;
function N() {
  if (Ie) return ne;
  Ie = 1, ne = { transform: r };
  function r({
    logger: i,
    message: n,
    transport: s,
    initialData: e = n?.data || [],
    transforms: a = s?.transforms
  }) {
    return a.reduce((t, o) => typeof o == "function" ? o({ data: t, logger: i, message: n, transport: s }) : t, e);
  }
  return ne;
}
var re, Ne;
function lt() {
  if (Ne) return re;
  Ne = 1;
  const { transform: r } = N();
  re = {
    concatFirstStringElements: i,
    formatScope: s,
    formatText: a,
    formatVariables: e,
    timeZoneFromOffset: n,
    format({ message: t, logger: o, transport: c, data: l = t?.data }) {
      switch (typeof c.format) {
        case "string":
          return r({
            message: t,
            logger: o,
            transforms: [e, s, a],
            transport: c,
            initialData: [c.format, ...l]
          });
        case "function":
          return c.format({
            data: l,
            level: t?.level || "info",
            logger: o,
            message: t,
            transport: c
          });
        default:
          return l;
      }
    }
  };
  function i({ data: t }) {
    return typeof t[0] != "string" || typeof t[1] != "string" || t[0].match(/%[1cdfiOos]/) ? t : [`${t[0]} ${t[1]}`, ...t.slice(2)];
  }
  function n(t) {
    const o = Math.abs(t), c = t > 0 ? "-" : "+", l = Math.floor(o / 60).toString().padStart(2, "0"), u = (o % 60).toString().padStart(2, "0");
    return `${c}${l}:${u}`;
  }
  function s({ data: t, logger: o, message: c }) {
    const { defaultLabel: l, labelLength: u } = o?.scope || {}, p = t[0];
    let d = c.scope;
    d || (d = l);
    let g;
    return d === "" ? g = u > 0 ? "".padEnd(u + 3) : "" : typeof d == "string" ? g = ` (${d})`.padEnd(u + 3) : g = "", t[0] = p.replace("{scope}", g), t;
  }
  function e({ data: t, message: o }) {
    let c = t[0];
    if (typeof c != "string")
      return t;
    c = c.replace("{level}]", `${o.level}]`.padEnd(6, " "));
    const l = o.date || /* @__PURE__ */ new Date();
    return t[0] = c.replace(/\{(\w+)}/g, (u, p) => {
      switch (p) {
        case "level":
          return o.level || "info";
        case "logId":
          return o.logId;
        case "y":
          return l.getFullYear().toString(10);
        case "m":
          return (l.getMonth() + 1).toString(10).padStart(2, "0");
        case "d":
          return l.getDate().toString(10).padStart(2, "0");
        case "h":
          return l.getHours().toString(10).padStart(2, "0");
        case "i":
          return l.getMinutes().toString(10).padStart(2, "0");
        case "s":
          return l.getSeconds().toString(10).padStart(2, "0");
        case "ms":
          return l.getMilliseconds().toString(10).padStart(3, "0");
        case "z":
          return n(l.getTimezoneOffset());
        case "iso":
          return l.toISOString();
        default:
          return o.variables?.[p] || u;
      }
    }).trim(), t;
  }
  function a({ data: t }) {
    const o = t[0];
    if (typeof o != "string")
      return t;
    if (o.lastIndexOf("{text}") === o.length - 6)
      return t[0] = o.replace(/\s?{text}/, ""), t[0] === "" && t.shift(), t;
    const l = o.split("{text}");
    let u = [];
    return l[0] !== "" && u.push(l[0]), u = u.concat(t.slice(1)), l[1] !== "" && u.push(l[1]), u;
  }
  return re;
}
var ie = { exports: {} }, Me;
function U() {
  return Me || (Me = 1, (function(r) {
    const i = Ot;
    r.exports = {
      serialize: s,
      maxDepth({ data: e, transport: a, depth: t = a?.depth ?? 6 }) {
        if (!e)
          return e;
        if (t < 1)
          return Array.isArray(e) ? "[array]" : typeof e == "object" && e ? "[object]" : e;
        if (Array.isArray(e))
          return e.map((c) => r.exports.maxDepth({
            data: c,
            depth: t - 1
          }));
        if (typeof e != "object" || e && typeof e.toISOString == "function")
          return e;
        if (e === null)
          return null;
        if (e instanceof Error)
          return e;
        const o = {};
        for (const c in e)
          Object.prototype.hasOwnProperty.call(e, c) && (o[c] = r.exports.maxDepth({
            data: e[c],
            depth: t - 1
          }));
        return o;
      },
      toJSON({ data: e }) {
        return JSON.parse(JSON.stringify(e, n()));
      },
      toString({ data: e, transport: a }) {
        const t = a?.inspectOptions || {}, o = e.map((c) => {
          if (c !== void 0)
            try {
              const l = JSON.stringify(c, n(), "  ");
              return l === void 0 ? void 0 : JSON.parse(l);
            } catch {
              return c;
            }
        });
        return i.formatWithOptions(t, ...o);
      }
    };
    function n(e = {}) {
      const a = /* @__PURE__ */ new WeakSet();
      return function(t, o) {
        if (typeof o == "object" && o !== null) {
          if (a.has(o))
            return;
          a.add(o);
        }
        return s(t, o, e);
      };
    }
    function s(e, a, t = {}) {
      const o = t?.serializeMapAndSet !== !1;
      return a instanceof Error ? a.stack : a && (typeof a == "function" ? `[function] ${a.toString()}` : a instanceof Date ? a.toISOString() : o && a instanceof Map && Object.fromEntries ? Object.fromEntries(a) : o && a instanceof Set && Array.from ? Array.from(a) : a);
    }
  })(ie)), ie.exports;
}
var se, qe;
function xe() {
  if (qe) return se;
  qe = 1, se = {
    transformStyles: s,
    applyAnsiStyles({ data: e }) {
      return s(e, i, n);
    },
    removeStyles({ data: e }) {
      return s(e, () => "");
    }
  };
  const r = {
    unset: "\x1B[0m",
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    gray: "\x1B[90m"
  };
  function i(e) {
    const a = e.replace(/color:\s*(\w+).*/, "$1").toLowerCase();
    return r[a] || "";
  }
  function n(e) {
    return e + r.unset;
  }
  function s(e, a, t) {
    const o = {};
    return e.reduce((c, l, u, p) => {
      if (o[u])
        return c;
      if (typeof l == "string") {
        let d = u, g = !1;
        l = l.replace(/%[1cdfiOos]/g, (b) => {
          if (d += 1, b !== "%c")
            return b;
          const m = p[d];
          return typeof m == "string" ? (o[d] = !0, g = !0, a(m, l)) : b;
        }), g && t && (l = t(l));
      }
      return c.push(l), c;
    }, []);
  }
  return se;
}
var oe, ze;
function Wt() {
  if (ze) return oe;
  ze = 1;
  const {
    concatFirstStringElements: r,
    format: i
  } = lt(), { maxDepth: n, toJSON: s } = U(), {
    applyAnsiStyles: e,
    removeStyles: a
  } = xe(), { transform: t } = N(), o = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    verbose: console.info,
    debug: console.debug,
    silly: console.debug,
    log: console.log
  };
  oe = u;
  const l = `%c{h}:{i}:{s}.{ms}{scope}%c ${process.platform === "win32" ? ">" : "›"} {text}`;
  Object.assign(u, {
    DEFAULT_FORMAT: l
  });
  function u(m) {
    return Object.assign(h, {
      colorMap: {
        error: "red",
        warn: "yellow",
        info: "cyan",
        verbose: "unset",
        debug: "gray",
        silly: "gray",
        default: "unset"
      },
      format: l,
      level: "silly",
      transforms: [
        p,
        i,
        g,
        r,
        n,
        s
      ],
      useStyles: process.env.FORCE_STYLES,
      writeFn({ message: E }) {
        (o[E.level] || o.info)(...E.data);
      }
    });
    function h(E) {
      const P = t({ logger: m, message: E, transport: h });
      h.writeFn({
        message: { ...E, data: P }
      });
    }
  }
  function p({ data: m, message: h, transport: E }) {
    return typeof E.format != "string" || !E.format.includes("%c") ? m : [
      `color:${b(h.level, E)}`,
      "color:unset",
      ...m
    ];
  }
  function d(m, h) {
    if (typeof m == "boolean")
      return m;
    const P = h === "error" || h === "warn" ? process.stderr : process.stdout;
    return P && P.isTTY;
  }
  function g(m) {
    const { message: h, transport: E } = m;
    return (d(E.useStyles, h.level) ? e : a)(m);
  }
  function b(m, h) {
    return h.colorMap[m] || h.colorMap.default;
  }
  return oe;
}
var ae, We;
function ut() {
  if (We) return ae;
  We = 1;
  const r = ct, i = I, n = W;
  class s extends r {
    asyncWriteQueue = [];
    bytesWritten = 0;
    hasActiveAsyncWriting = !1;
    path = null;
    initialSize = void 0;
    writeOptions = null;
    writeAsync = !1;
    constructor({
      path: t,
      writeOptions: o = { encoding: "utf8", flag: "a", mode: 438 },
      writeAsync: c = !1
    }) {
      super(), this.path = t, this.writeOptions = o, this.writeAsync = c;
    }
    get size() {
      return this.getSize();
    }
    clear() {
      try {
        return i.writeFileSync(this.path, "", {
          mode: this.writeOptions.mode,
          flag: "w"
        }), this.reset(), !0;
      } catch (t) {
        return t.code === "ENOENT" ? !0 : (this.emit("error", t, this), !1);
      }
    }
    crop(t) {
      try {
        const o = e(this.path, t || 4096);
        this.clear(), this.writeLine(`[log cropped]${n.EOL}${o}`);
      } catch (o) {
        this.emit(
          "error",
          new Error(`Couldn't crop file ${this.path}. ${o.message}`),
          this
        );
      }
    }
    getSize() {
      if (this.initialSize === void 0)
        try {
          const t = i.statSync(this.path);
          this.initialSize = t.size;
        } catch {
          this.initialSize = 0;
        }
      return this.initialSize + this.bytesWritten;
    }
    increaseBytesWrittenCounter(t) {
      this.bytesWritten += Buffer.byteLength(t, this.writeOptions.encoding);
    }
    isNull() {
      return !1;
    }
    nextAsyncWrite() {
      const t = this;
      if (this.hasActiveAsyncWriting || this.asyncWriteQueue.length === 0)
        return;
      const o = this.asyncWriteQueue.join("");
      this.asyncWriteQueue = [], this.hasActiveAsyncWriting = !0, i.writeFile(this.path, o, this.writeOptions, (c) => {
        t.hasActiveAsyncWriting = !1, c ? t.emit(
          "error",
          new Error(`Couldn't write to ${t.path}. ${c.message}`),
          this
        ) : t.increaseBytesWrittenCounter(o), t.nextAsyncWrite();
      });
    }
    reset() {
      this.initialSize = void 0, this.bytesWritten = 0;
    }
    toString() {
      return this.path;
    }
    writeLine(t) {
      if (t += n.EOL, this.writeAsync) {
        this.asyncWriteQueue.push(t), this.nextAsyncWrite();
        return;
      }
      try {
        i.writeFileSync(this.path, t, this.writeOptions), this.increaseBytesWrittenCounter(t);
      } catch (o) {
        this.emit(
          "error",
          new Error(`Couldn't write to ${this.path}. ${o.message}`),
          this
        );
      }
    }
  }
  ae = s;
  function e(a, t) {
    const o = Buffer.alloc(t), c = i.statSync(a), l = Math.min(c.size, t), u = Math.max(0, c.size - t), p = i.openSync(a, "r"), d = i.readSync(p, o, 0, l, u);
    return i.closeSync(p), o.toString("utf8", 0, d);
  }
  return ae;
}
var ce, Ue;
function Ut() {
  if (Ue) return ce;
  Ue = 1;
  const r = ut();
  class i extends r {
    clear() {
    }
    crop() {
    }
    getSize() {
      return 0;
    }
    isNull() {
      return !0;
    }
    writeLine() {
    }
  }
  return ce = i, ce;
}
var le, Xe;
function Xt() {
  if (Xe) return le;
  Xe = 1;
  const r = ct, i = I, n = $, s = ut(), e = Ut();
  class a extends r {
    store = {};
    constructor() {
      super(), this.emitError = this.emitError.bind(this);
    }
    /**
     * Provide a File object corresponding to the filePath
     * @param {string} filePath
     * @param {WriteOptions} [writeOptions]
     * @param {boolean} [writeAsync]
     * @return {File}
     */
    provide({ filePath: o, writeOptions: c = {}, writeAsync: l = !1 }) {
      let u;
      try {
        if (o = n.resolve(o), this.store[o])
          return this.store[o];
        u = this.createFile({ filePath: o, writeOptions: c, writeAsync: l });
      } catch (p) {
        u = new e({ path: o }), this.emitError(p, u);
      }
      return u.on("error", this.emitError), this.store[o] = u, u;
    }
    /**
     * @param {string} filePath
     * @param {WriteOptions} writeOptions
     * @param {boolean} async
     * @return {File}
     * @private
     */
    createFile({ filePath: o, writeOptions: c, writeAsync: l }) {
      return this.testFileWriting({ filePath: o, writeOptions: c }), new s({ path: o, writeOptions: c, writeAsync: l });
    }
    /**
     * @param {Error} error
     * @param {File} file
     * @private
     */
    emitError(o, c) {
      this.emit("error", o, c);
    }
    /**
     * @param {string} filePath
     * @param {WriteOptions} writeOptions
     * @private
     */
    testFileWriting({ filePath: o, writeOptions: c }) {
      i.mkdirSync(n.dirname(o), { recursive: !0 }), i.writeFileSync(o, "", { flag: "a", mode: c.mode });
    }
  }
  return le = a, le;
}
var ue, He;
function Ht() {
  if (He) return ue;
  He = 1;
  const r = I, i = W, n = $, s = Xt(), { transform: e } = N(), { removeStyles: a } = xe(), {
    format: t,
    concatFirstStringElements: o
  } = lt(), { toString: c } = U();
  ue = u;
  const l = new s();
  function u(d, { registry: g = l, externalApi: b } = {}) {
    let m;
    return g.listenerCount("error") < 1 && g.on("error", (w, y) => {
      P(`Can't write to ${y}`, w);
    }), Object.assign(h, {
      fileName: p(d.variables.processType),
      format: "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}",
      getFile: H,
      inspectOptions: { depth: 5 },
      level: "silly",
      maxSize: 1024 ** 2,
      readAllLogs: vt,
      sync: !0,
      transforms: [a, t, o, c],
      writeOptions: { flag: "a", mode: 438, encoding: "utf8" },
      archiveLogFn(w) {
        const y = w.toString(), T = n.parse(y);
        try {
          r.renameSync(y, n.join(T.dir, `${T.name}.old${T.ext}`));
        } catch (k) {
          P("Could not rotate log", k);
          const bt = Math.round(h.maxSize / 4);
          w.crop(Math.min(bt, 256 * 1024));
        }
      },
      resolvePathFn(w) {
        return n.join(w.libraryDefaultDir, w.fileName);
      },
      setAppName(w) {
        d.dependencies.externalApi.setAppName(w);
      }
    });
    function h(w) {
      const y = H(w);
      h.maxSize > 0 && y.size > h.maxSize && (h.archiveLogFn(y), y.reset());
      const k = e({ logger: d, message: w, transport: h });
      y.writeLine(k);
    }
    function E() {
      m || (m = Object.create(
        Object.prototype,
        {
          ...Object.getOwnPropertyDescriptors(
            b.getPathVariables()
          ),
          fileName: {
            get() {
              return h.fileName;
            },
            enumerable: !0
          }
        }
      ), typeof h.archiveLog == "function" && (h.archiveLogFn = h.archiveLog, P("archiveLog is deprecated. Use archiveLogFn instead")), typeof h.resolvePath == "function" && (h.resolvePathFn = h.resolvePath, P("resolvePath is deprecated. Use resolvePathFn instead")));
    }
    function P(w, y = null, T = "error") {
      const k = [`electron-log.transports.file: ${w}`];
      y && k.push(y), d.transports.console({ data: k, date: /* @__PURE__ */ new Date(), level: T });
    }
    function H(w) {
      E();
      const y = h.resolvePathFn(m, w);
      return g.provide({
        filePath: y,
        writeAsync: !h.sync,
        writeOptions: h.writeOptions
      });
    }
    function vt({ fileFilter: w = (y) => y.endsWith(".log") } = {}) {
      E();
      const y = n.dirname(h.resolvePathFn(m));
      return r.existsSync(y) ? r.readdirSync(y).map((T) => n.join(y, T)).filter(w).map((T) => {
        try {
          return {
            path: T,
            lines: r.readFileSync(T, "utf8").split(i.EOL)
          };
        } catch {
          return null;
        }
      }).filter(Boolean) : [];
    }
  }
  function p(d = process.type) {
    switch (d) {
      case "renderer":
        return "renderer.log";
      case "worker":
        return "worker.log";
      default:
        return "main.log";
    }
  }
  return ue;
}
var pe, Be;
function Bt() {
  if (Be) return pe;
  Be = 1;
  const { maxDepth: r, toJSON: i } = U(), { transform: n } = N();
  pe = s;
  function s(e, { externalApi: a }) {
    return Object.assign(t, {
      depth: 3,
      eventId: "__ELECTRON_LOG_IPC__",
      level: e.isDev ? "silly" : !1,
      transforms: [i, r]
    }), a?.isElectron() ? t : void 0;
    function t(o) {
      o?.variables?.processType !== "renderer" && a?.sendIpc(t.eventId, {
        ...o,
        data: n({ logger: e, message: o, transport: t })
      });
    }
  }
  return pe;
}
var de, Je;
function Jt() {
  if (Je) return de;
  Je = 1;
  const r = Ft, i = Dt, { transform: n } = N(), { removeStyles: s } = xe(), { toJSON: e, maxDepth: a } = U();
  de = t;
  function t(o) {
    return Object.assign(c, {
      client: { name: "electron-application" },
      depth: 6,
      level: !1,
      requestOptions: {},
      transforms: [s, e, a],
      makeBodyFn({ message: l }) {
        return JSON.stringify({
          client: c.client,
          data: l.data,
          date: l.date.getTime(),
          level: l.level,
          scope: l.scope,
          variables: l.variables
        });
      },
      processErrorFn({ error: l }) {
        o.processMessage(
          {
            data: [`electron-log: can't POST ${c.url}`, l],
            level: "warn"
          },
          { transports: ["console", "file"] }
        );
      },
      sendRequestFn({ serverUrl: l, requestOptions: u, body: p }) {
        const g = (l.startsWith("https:") ? i : r).request(l, {
          method: "POST",
          ...u,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": p.length,
            ...u.headers
          }
        });
        return g.write(p), g.end(), g;
      }
    });
    function c(l) {
      if (!c.url)
        return;
      const u = c.makeBodyFn({
        logger: o,
        message: { ...l, data: n({ logger: o, message: l, transport: c }) },
        transport: c
      }), p = c.sendRequestFn({
        serverUrl: c.url,
        requestOptions: c.requestOptions,
        body: Buffer.from(u, "utf8")
      });
      p.on("error", (d) => c.processErrorFn({
        error: d,
        logger: o,
        message: l,
        request: p,
        transport: c
      }));
    }
  }
  return de;
}
var fe, Ve;
function Vt() {
  if (Ve) return fe;
  Ve = 1;
  const r = Mt(), i = qt(), n = zt(), s = Wt(), e = Ht(), a = Bt(), t = Jt();
  fe = o;
  function o({ dependencies: c, initializeFn: l }) {
    const u = new r({
      dependencies: c,
      errorHandler: new i(),
      eventLogger: new n(),
      initializeFn: l,
      isDev: c.externalApi?.isDev(),
      logId: "default",
      transportFactories: {
        console: s,
        file: e,
        ipc: a,
        remote: t
      },
      variables: {
        processType: "main"
      }
    });
    return u.default = u, u.Logger = r, u.processInternalErrorFn = (p) => {
      u.transports.console.writeFn({
        message: {
          data: ["Unhandled electron-log error", p],
          level: "error"
        }
      });
    }, u;
  }
  return fe;
}
var he, Ge;
function Gt() {
  if (Ge) return he;
  Ge = 1;
  const r = Et, i = jt(), { initialize: n } = Rt(), s = Vt(), e = new i({ electron: r }), a = s({
    dependencies: { externalApi: e },
    initializeFn: n
  });
  he = a, e.onIpc("__ELECTRON_LOG__", (o, c) => {
    c.scope && a.Logger.getInstance(c).scope(c.scope);
    const l = new Date(c.date);
    t({
      ...c,
      date: l.getTime() ? l : /* @__PURE__ */ new Date()
    });
  }), e.onIpcInvoke("__ELECTRON_LOG__", (o, { cmd: c = "", logId: l }) => c === "getOptions" ? {
    levels: a.Logger.getInstance({ logId: l }).levels,
    logId: l
  } : (t({ data: [`Unknown cmd '${c}'`], level: "error" }), {}));
  function t(o) {
    a.Logger.getInstance(o)?.processMessage(o);
  }
  return he;
}
var ge, Ke;
function Kt() {
  return Ke || (Ke = 1, ge = Gt()), ge;
}
var Yt = Kt();
const pt = /* @__PURE__ */ kt(Yt);
function Qt(r) {
  return r.replace(/\\/g, "\\textbackslash{}").replace(/([%&_#$])/g, "\\$1");
}
function Zt(r) {
  return r.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "underleaf-project";
}
function en(r) {
  return `\\documentclass[12pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage{hyperref}

\\title{${Qt(r.trim() || "Untitled Document")}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Start writing here. This project supports live view while you type and exact PDF compilation on demand.

\\subsection{A Visual Edit Block}
You can update section titles, paragraphs, lists, and figure metadata from the visual editor.

\\begin{itemize}
  \\item First bullet
  \\item Second bullet
\\end{itemize}

\\begin{figure}[h]
\\centering
\\includegraphics[width=0.45\\textwidth]{example-image}
\\caption{A sample figure placeholder}
\\end{figure}

Inline math works too: $E = mc^2$.

\\end{document}
`;
}
const tn = D(st(import.meta.url)), nn = Ee(tn, ".."), rn = "settings.json", sn = /* @__PURE__ */ new Set([".tex"]), on = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".pdf", ".svg", ".eps"]), an = 10, Ye = "TinyTeX-darwin.tar.xz", cn = 4;
let v = null, dt = yt(process.argv), R = null, O = "idle";
pt.initialize();
function we() {
  return f(x.getPath("userData"), rn);
}
function ln() {
  return f(x.getPath("userData"), "bin", "tectonic");
}
function Qe() {
  return f(x.getPath("userData"), "tectonic-cache");
}
function ft() {
  return f(x.getPath("home"), ".underleaf-tinytex");
}
function ht() {
  return f(ft(), "TinyTeX");
}
async function j() {
  try {
    const r = await M(we(), "utf8");
    return JSON.parse(r);
  } catch {
    return { recentProjects: [] };
  }
}
async function Se(r) {
  await F(D(we()), { recursive: !0 }), await q(we(), JSON.stringify(r, null, 2), "utf8");
}
async function un(r) {
  const i = await j(), n = i.recentProjects.filter((s) => s.projectPath !== r);
  i.recentProjects = [
    { projectPath: r, lastOpenedAt: (/* @__PURE__ */ new Date()).toISOString() },
    ...n
  ].slice(0, an), await Se(i);
}
async function pn(r) {
  const i = f(r, "main.tex");
  try {
    return await A(i, L.R_OK), i;
  } catch {
    const s = (await gt(r)).find((e) => e.kind === "tex");
    if (!s)
      throw new Error("No .tex files found in this folder.");
    return s.absolutePath;
  }
}
async function gt(r) {
  const i = [];
  async function n(s) {
    const e = await be(s, { withFileTypes: !0 });
    for (const a of e) {
      if (a.name.startsWith("."))
        continue;
      const t = f(s, a.name);
      if (a.isDirectory()) {
        if (a.name === "build" || a.name === "dist" || a.name === "release")
          continue;
        await n(t);
        continue;
      }
      const o = Pt(a.name).toLowerCase(), c = t.slice(r.length + 1);
      sn.has(o) ? i.push({ absolutePath: t, relativePath: c, kind: "tex" }) : on.has(o) && i.push({ absolutePath: t, relativePath: c, kind: "asset" });
    }
  }
  return await n(r), i.sort((s, e) => s.relativePath.localeCompare(e.relativePath));
}
async function mt(r) {
  const n = (await j()).recentProjects.find((s) => s.projectPath === r);
  return {
    name: r.split("/").pop() ?? "Untitled Project",
    projectPath: r,
    mainFilePath: await pn(r),
    lastOpenedAt: n?.lastOpenedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function ve(r) {
  const i = Ee(r);
  if (!(await xt(i)).isDirectory())
    throw new Error("Project path must be a folder.");
  const s = await mt(i), e = await gt(i);
  return await un(i), {
    summary: s,
    files: e
  };
}
async function dn(r, i) {
  const n = Zt(r);
  let s = f(i, n), e = 1;
  for (; ; )
    try {
      await A(s, L.F_OK), s = f(i, `${n}-${e}`), e += 1;
    } catch {
      break;
    }
  return await F(s, { recursive: !0 }), await F(f(s, "build"), { recursive: !0 }), await q(f(s, "main.tex"), en(r), "utf8"), ve(s);
}
async function fn() {
  const r = await j();
  return (await Promise.all(
    r.recentProjects.map(async (n) => {
      try {
        return { ...await mt(n.projectPath), lastOpenedAt: n.lastOpenedAt };
      } catch {
        return null;
      }
    })
  )).filter((n) => n !== null);
}
function yt(r) {
  const i = r.slice(x.isPackaged ? 1 : 2).map((n) => n.trim()).find((n) => n && !n.startsWith("-"));
  if (i)
    return Ee(i);
}
function Ze() {
  const r = new rt({
    width: 1520,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#f3ede2",
    titleBarStyle: "default",
    webPreferences: {
      preload: st(new URL("./preload.mjs", import.meta.url)),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    }
  });
  return process.env.VITE_DEV_SERVER_URL ? r.loadURL(process.env.VITE_DEV_SERVER_URL) : r.loadFile(f(nn, "dist/index.html")), r;
}
async function C(r) {
  return new Promise((i) => {
    const n = z("which", [r], { stdio: ["ignore", "pipe", "ignore"] });
    let s = "";
    n.stdout.on("data", (e) => {
      s += e.toString();
    }), n.on("exit", (e) => {
      i(e === 0 ? s.trim() : null);
    });
  });
}
async function _() {
  const r = await j(), i = ln(), n = await Pe(), s = [
    { kind: "tectonic", path: await C("tectonic"), source: "system" },
    { kind: "xelatex", path: await C("xelatex"), source: "system" },
    { kind: "lualatex", path: await C("lualatex"), source: "system" },
    { kind: "pdflatex", path: await C("pdflatex"), source: "system" },
    {
      kind: "xelatex",
      path: "/Library/TeX/texbin/xelatex",
      source: "system"
    },
    {
      kind: "lualatex",
      path: "/Library/TeX/texbin/lualatex",
      source: "system"
    },
    {
      kind: "pdflatex",
      path: "/Library/TeX/texbin/pdflatex",
      source: "system"
    },
    {
      kind: "tectonic",
      path: i,
      source: "managed"
    },
    {
      kind: "xelatex",
      path: n ? f(n, "xelatex") : null,
      source: "managed"
    },
    {
      kind: "lualatex",
      path: n ? f(n, "lualatex") : null,
      source: "managed"
    },
    {
      kind: "pdflatex",
      path: n ? f(n, "pdflatex") : null,
      source: "managed"
    },
    r.texEngine ?? null
  ], e = /* @__PURE__ */ new Set(), a = [];
  for (const o of s)
    if (o?.path) {
      const c = `${o.kind}:${o.path}:${o.source}`;
      e.has(c) || (e.add(c), a.push(o));
    }
  for (const o of a)
    try {
      await A(o.path, L.X_OK);
      const c = {
        ready: !0,
        engine: o,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: o.kind === "tectonic" ? o.source === "managed" ? "Managed Tectonic engine detected and ready to compile with on-demand package downloads." : "System Tectonic engine detected and ready to compile with on-demand package downloads." : o.source === "managed" ? `Managed ${o.kind} detected and ready to compile with package installs on demand.` : `${o.kind} detected and ready to compile.`,
        installState: O
      };
      return R = c, c;
    } catch {
      continue;
    }
  const t = {
    ready: !1,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    message: "No TeX engine is installed yet. Use the installer to download local Tectonic support, or open a XeLaTeX project and Underleaf will install a managed TinyTeX toolchain automatically.",
    installState: O
  };
  return R = t, t;
}
async function hn() {
  const r = await fetch("https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest", {
    headers: {
      "User-Agent": "underleaf-app",
      Accept: "application/vnd.github+json"
    }
  });
  if (!r.ok)
    throw new Error(`Unable to fetch Tectonic release metadata (${r.status}).`);
  const i = await r.json(), n = process.arch === "arm64" ? "aarch64" : "x86_64", s = i.assets?.find(
    (t) => t.name?.includes(`${n}-apple-darwin`) && t.name.endsWith(".tar.gz") && t.browser_download_url
  );
  if (!s?.browser_download_url || !s.name)
    throw new Error("Could not find a macOS Tectonic download for this machine.");
  const e = f(ot(), s.name), a = await fetch(s.browser_download_url, {
    headers: {
      "User-Agent": "underleaf-app",
      Accept: "application/octet-stream"
    }
  });
  if (!a.ok || !a.body)
    throw new Error(`Unable to download Tectonic (${a.status}).`);
  return await at(a.body, it(e)), e;
}
async function gn(r) {
  const i = f(x.getPath("userData"), "bin");
  await F(i, { recursive: !0 }), await new Promise((a, t) => {
    z("tar", ["-xzf", r, "-C", i], { stdio: "ignore" }).on("exit", (c) => {
      c === 0 ? a() : t(new Error("Failed to extract the downloaded Tectonic archive."));
    });
  });
  const s = (await be(i, { withFileTypes: !0 })).find((a) => a.isDirectory() && a.name.startsWith("tectonic-")), e = s ? f(i, s.name, "tectonic") : f(i, "tectonic");
  try {
    await A(e, L.X_OK);
  } catch {
    if (s) {
      const a = f(i, s.name, "tectonic");
      return await Te(a, f(i, "tectonic")), await Ae(f(i, "tectonic"), 493), f(i, "tectonic");
    }
    throw new Error("Tectonic binary was not found after extraction.");
  }
  return s ? (await Te(e, f(i, "tectonic")), await Ae(f(i, "tectonic"), 493), f(i, "tectonic")) : e;
}
async function Pe() {
  const r = f(ht(), "bin");
  try {
    const n = (await be(r, { withFileTypes: !0 })).find((s) => s.isDirectory());
    return n ? f(r, n.name) : null;
  } catch {
    return null;
  }
}
async function mn() {
  const r = f(ot(), Ye), i = await fetch(
    `https://github.com/rstudio/tinytex-releases/releases/download/daily/${Ye}`,
    {
      headers: {
        "User-Agent": "underleaf-app",
        Accept: "application/octet-stream"
      }
    }
  );
  if (!i.ok || !i.body)
    throw new Error(`Unable to download TinyTeX (${i.status}).`);
  return await at(i.body, it(r)), r;
}
async function X(r, i, n = {}) {
  const s = [];
  return {
    ...await new Promise((a, t) => {
      const o = z(r, i, {
        cwd: n.cwd,
        env: n.env
      });
      o.stdout.on("data", (c) => {
        s.push(c.toString());
      }), o.stderr.on("data", (c) => {
        s.push(c.toString());
      }), o.on("error", t), o.on("exit", (c, l) => a({ code: c, signal: l }));
    }),
    output: s.join("")
  };
}
async function yn(r) {
  const i = ft();
  await F(i, { recursive: !0 }), await St(ht(), { recursive: !0, force: !0 }), await new Promise((e, a) => {
    z("tar", ["-xf", r, "-C", i], { stdio: "ignore" }).on("exit", (o) => {
      o === 0 ? e() : a(new Error("Failed to extract the downloaded TinyTeX archive."));
    });
  });
  const n = await Pe();
  if (!n)
    throw new Error("TinyTeX installed, but its bin directory could not be found.");
  const s = f(n, "tlmgr");
  return await A(s, L.X_OK), await X(s, ["postaction", "install", "script", "xetex"], {
    env: {
      ...process.env,
      PATH: `${n}:${process.env.PATH ?? ""}`
    }
  }), n;
}
async function wn(r) {
  O = "installing", v?.webContents.send(
    "compile-status",
    `Installing managed TinyTeX with ${r} support. This can take a minute the first time...`
  );
  try {
    const i = await mn(), n = await yn(i), s = f(n, r);
    await A(s, L.X_OK);
    const e = await j();
    return e.texEngine = {
      kind: r,
      path: s,
      source: "managed"
    }, await Se(e), O = "idle", R = null, {
      kind: r,
      path: s,
      source: "managed"
    };
  } catch (i) {
    throw O = "failed", i instanceof Error ? i : new Error("Managed TinyTeX installation failed.");
  }
}
async function wt() {
  O = "installing", v?.webContents.send("compile-status", "Installing local TeX engine...");
  try {
    const r = await hn(), i = await gn(r), n = await j();
    return n.texEngine = {
      kind: "tectonic",
      path: i,
      source: "managed"
    }, await Se(n), O = "idle", _();
  } catch (r) {
    O = "failed";
    const i = r instanceof Error ? r.message : "TeX installation failed.", n = {
      ready: !1,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: i,
      installState: O
    };
    return R = n, n;
  }
}
function vn(r) {
  const i = [], n = /^(.+?):(\d+):\s(.+)$/gm;
  let s = n.exec(r);
  for (; s; )
    i.push({
      file: s[1],
      line: Number.parseInt(s[2], 10),
      message: s[3].trim()
    }), s = n.exec(r);
  if (i.length === 0) {
    const e = r.match(/^!\s(.+)$/m);
    e && i.push({ message: e[1].trim() });
  }
  return i;
}
function bn(r) {
  return r.match(/LaTeX Error: File [`']([^`']+)['`] not found\./i)?.[1] ?? r.match(/I can't find file [`']([^`']+)['`]/i)?.[1] ?? null;
}
function En(r, i) {
  return r.kind !== "xelatex" && r.kind !== "lualatex" ? !1 : /\\input\{glyphtounicode\}/.test(i) || /\\pdfg(?:lyph|ent)ounicode\b/.test(i);
}
async function xn(r) {
  const i = f(D(r), ".underleaf-compile-wrapper.tex"), s = [
    "\\RequirePackage{iftex}",
    "\\ifPDFTeX\\else",
    "\\providecommand{\\pdfglyphtounicode}[2]{}",
    "\\providecommand{\\pdfgentounicode}[1]{}",
    "\\fi",
    `\\input{${At(D(i), r).replace(/\\/g, "/")}}`,
    ""
  ].join(`
`);
  return await q(i, s, "utf8"), i;
}
function Sn(r) {
  return /LaTeX Error: File [`'][^`']+\.(sty|cls|bst|bib|def)['`] not found/i.test(r) || /I can't find file [`'][^`']+['`]/i.test(r) || /! Emergency stop\./i.test(r);
}
function Pn(r) {
  const i = r.match(/^\s*%\s*!TEX\s+program\s*=\s*(xelatex|lualatex|pdflatex)\s*$/im)?.[1];
  return i === "xelatex" || i === "lualatex" ? i : /\\usepackage(?:\[[^\]]*\])?\{fontspec\}/.test(r) || /\\setmainfont\b/.test(r) || /\\newfontfamily\b/.test(r) || /\\usepackage(?:\[[^\]]*\])?\{fontawesome5\}/.test(r) ? "xelatex" : "tectonic";
}
async function Tn(r) {
  const i = [
    await C(r),
    `/Library/TeX/texbin/${r}`
  ];
  for (const n of i)
    if (n)
      try {
        return await A(n, L.X_OK), {
          kind: r,
          path: n,
          source: "system"
        };
      } catch {
        continue;
      }
  return null;
}
async function An(r) {
  const i = await Pe();
  if (!i)
    return null;
  const n = f(i, r);
  try {
    return await A(n, L.X_OK), {
      kind: r,
      path: n,
      source: "managed"
    };
  } catch {
    return null;
  }
}
async function et(r) {
  const i = await An(r);
  return i || wn(r);
}
async function tt() {
  const r = await _();
  if (r.ready && r.engine?.kind === "tectonic")
    return r.engine;
  v?.webContents.send("compile-status", "Preparing download-on-demand LaTeX compiler...");
  const i = await wt();
  if (!i.ready || !i.engine)
    throw new Error(i.message || "Unable to prepare the managed LaTeX compiler.");
  return i.engine;
}
async function Ln(r, i) {
  if (r.kind === "tectonic")
    return null;
  const n = D(r.path), s = f(n, "tlmgr");
  try {
    await A(s, L.X_OK);
  } catch {
    return null;
  }
  const e = await X(s, ["search", "--global", "--file", `/${i}`], {
    env: {
      ...process.env,
      PATH: `${n}:${process.env.PATH ?? ""}`
    }
  });
  return e.code !== 0 ? null : e.output.split(`
`).map((t) => t.trimEnd()).filter((t) => t && !t.startsWith(" ") && !t.startsWith("tlmgr:") && t.endsWith(":")).map((t) => t.slice(0, -1))[0] ?? null;
}
async function On(r, i) {
  if (r.kind === "tectonic")
    return !1;
  const n = D(r.path), s = f(n, "tlmgr");
  try {
    await A(s, L.X_OK);
  } catch {
    return !1;
  }
  return v?.webContents.send("compile-status", `Installing LaTeX package ${i}...`), (await X(s, ["install", i], {
    env: {
      ...process.env,
      PATH: `${n}:${process.env.PATH ?? ""}`
    }
  })).code === 0;
}
async function nt(r, i, n, s) {
  await F(f(i, "build"), { recursive: !0 }), await F(Qe(), { recursive: !0 }), v?.webContents.send(
    "compile-status",
    r.kind === "tectonic" ? "Compiling PDF with Tectonic. Missing packages will download automatically if needed..." : r.source === "managed" ? `Compiling PDF with managed ${r.kind}...` : `Compiling PDF with system ${r.kind}...`
  );
  const a = (En(r, s) ? await xn(n) : n).slice(i.length + 1), t = Tt(n).replace(/\.tex$/i, "") || "main", o = r.kind === "pdflatex" || r.kind === "xelatex" || r.kind === "lualatex" ? [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    "-jobname",
    t,
    "-output-directory",
    "build",
    a
  ] : ["--keep-logs", "--keep-intermediates", "--outdir", "build", a], c = await X(r.path, o, {
    cwd: i,
    env: {
      ...process.env,
      PATH: `${D(r.path)}:${process.env.PATH ?? ""}`,
      TECTONIC_CACHE_DIR: Qe()
    }
  }), l = c.output, u = f(i, "build", `${t}.pdf`), p = f(i, "build", `${t}.log`), d = {
    ok: c.code === 0,
    pdfPath: u,
    logPath: p,
    output: l,
    issues: vn(l)
  };
  return v?.webContents.send(
    "compile-status",
    d.ok ? "PDF compile finished." : d.issues.length > 0 ? "Compile failed. See the reported LaTeX errors below." : r.kind === "tectonic" ? "Compile failed. Tectonic could not resolve this project." : "Compile failed. The compiler stopped before producing a PDF."
  ), d;
}
async function me(r, i, n, s) {
  let e = await nt(r, i, n, s);
  const a = /* @__PURE__ */ new Set();
  for (let t = 0; t < cn && !e.ok && !(r.source !== "managed" || r.kind === "tectonic"); t += 1) {
    const o = bn(e.output);
    if (!o)
      break;
    const c = await Ln(r, o);
    if (!c || a.has(c) || (a.add(c), !await On(r, c)))
      break;
    e = await nt(r, i, n, s);
  }
  return e;
}
async function Fn(r, i) {
  const n = await M(i, "utf8"), s = Pn(n);
  let e = R ?? await _(), a;
  if (s === "xelatex" || s === "lualatex") {
    const o = await Tn(s);
    o ? a = o : a = await et(s);
  } else e.ready && e.engine && (e.engine.kind === "tectonic" || e.engine.kind === "pdflatex") ? a = e.engine : a = await tt();
  let t = await me(a, r, i, n);
  if (!t.ok && a.kind !== "tectonic" && Sn(t.output)) {
    if (s === "xelatex" || s === "lualatex") {
      v?.webContents.send(
        "compile-status",
        `System ${s} is missing packages. Switching to managed TinyTeX and downloading what this project needs...`
      );
      const o = await et(s);
      t = await me(o, r, i, n);
    } else if (a.kind === "pdflatex") {
      v?.webContents.send(
        "compile-status",
        "System TeX is missing packages. Switching to managed Tectonic and downloading what the project needs..."
      );
      const o = await tt();
      t = await me(o, r, i, n);
    }
  }
  return e = await _(), t;
}
function Dn() {
  S.handle("bootstrap-state", async () => ({
    initialProjectPath: dt
  })), S.handle("list-recent-projects", async () => fn()), S.handle("create-project", async (r, i, n) => dn(i, n)), S.handle("open-project-dialog", async () => {
    const r = await ye.showOpenDialog(v, {
      properties: ["openDirectory"],
      title: "Open Underleaf Project"
    });
    return r.canceled || r.filePaths.length === 0 ? null : ve(r.filePaths[0]);
  }), S.handle("select-directory", async () => {
    const r = await ye.showOpenDialog(v, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a Folder"
    });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
  }), S.handle("open-project", async (r, i) => ve(i)), S.handle("read-text-file", async (r, i) => M(i, "utf8")), S.handle("write-text-file", async (r, i, n) => {
    await q(i, n, "utf8");
  }), S.handle("read-binary-file", async (r, i) => {
    const n = await M(i);
    return new Uint8Array(n);
  }), S.handle("get-tex-status", async () => _()), S.handle("install-tex-engine", async () => wt()), S.handle(
    "compile-project",
    async (r, i, n) => Fn(i, n)
  );
}
async function kn() {
  if (!x.requestSingleInstanceLock()) {
    x.quit();
    return;
  }
  x.on("second-instance", (i, n) => {
    const s = yt(n);
    s && (dt = s, v?.webContents.send("project-requested-open", s)), v && (v.isMinimized() && v.restore(), v.focus());
  }), await x.whenReady(), Dn(), await _(), v = Ze(), x.on("activate", () => {
    rt.getAllWindows().length === 0 && (v = Ze());
  }), x.on("window-all-closed", () => {
    process.platform !== "darwin" && x.quit();
  });
}
kn().catch((r) => {
  pt.error(r), ye.showErrorBox("Underleaf failed to start", r instanceof Error ? r.message : String(r)), x.quit();
});
