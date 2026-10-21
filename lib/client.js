(function () {
  try {
    window.__ModuleLoader__.load({
      id: "dsh-blockbench-atelier",
      factory: function (require) {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        var React = require("react");
        var inject = ["betterSidebar"];
        var LS_KEY = "dsh-blockbench-atelier:bridge";
        var DEFAULT_BRIDGE = "http://127.0.0.1:9879";
        var REFRESH_MS = 1500;
        var TAB_ID = "dsh-blockbench-atelier:viewport";

        function bridgeBase() {
          try {
            var stored = window.localStorage.getItem(LS_KEY);
            if (stored) return String(stored).replace(/\/+$/, "");
          } catch (error) {
            void error;
          }
          return DEFAULT_BRIDGE;
        }

        function CubeIcon(props) {
          var size = props && props.size ? props.size : 16;
          return React.createElement("svg", {
            width: size, height: size, viewBox: "0 0 24 24", fill: "none",
            stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
            "aria-hidden": "true"
          },
            React.createElement("path", { d: "M12 2.8 20.4 7.2v9.6L12 21.2 3.6 16.8V7.2z" }),
            React.createElement("path", { d: "M12 2.8v18.4M3.6 7.2 12 11.6l8.4-4.4" })
          );
        }

        function statusDot(connected) {
          return React.createElement("span", {
            style: { width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", flex: "none" }
          });
        }

        function button(label, onClick, active) {
          return React.createElement("button", {
            type: "button",
            onClick: onClick,
            style: {
              border: "1px solid rgba(148,163,184,0.35)",
              background: active ? "rgba(34,197,94,0.16)" : "transparent",
              color: "inherit",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer"
            }
          }, label);
        }

        function ViewportTab(props) {
          var scope = props && props.scope ? props.scope : {};
          var visible = props && props.visible !== false;
          var viewState = React.useState({ status: null, frameUrl: "", error: null });
          var view = viewState[0];
          var setView = viewState[1];
          var autoState = React.useState(true);
          var auto = autoState[0];
          var setAuto = autoState[1];

          var refresh = React.useCallback(function () {
            var base = bridgeBase();
            var stamp = Date.now();
            fetch(base + "/status.json", { cache: "no-store" })
              .then(function (response) { return response.json(); })
              .then(function (status) {
                setView({ status: status, frameUrl: base + "/frame.png?t=" + stamp, error: null });
              })
              .catch(function (error) {
                setView({ status: null, frameUrl: "", error: String(error && error.message ? error.message : error) });
              });
          }, []);

          React.useEffect(function () {
            if (visible) refresh();
          }, [visible, refresh, scope.sessionId]);

          React.useEffect(function () {
            if (!auto || !visible) return undefined;
            var timer = window.setInterval(function () {
              if (document.visibilityState === "visible") refresh();
            }, REFRESH_MS);
            return function () { window.clearInterval(timer); };
          }, [auto, visible, refresh]);

          var status = view.status;
          var channel = status && status.channel ? status.channel : null;
          var connected = !!(channel && channel.connected);
          var project = channel && channel.project ? String(channel.project) : "";
          var elements = channel && typeof channel.elements === "number" ? channel.elements : 0;
          var head = connected ? (project || "untitled") + " · " + elements + " parts" : (view.error ? "bridge offline" : "waiting for Blockbench");

          return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8, padding: 10, boxSizing: "border-box" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 } },
              React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } },
                statusDot(connected),
                React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, head)
              ),
              React.createElement("span", { style: { display: "flex", gap: 6, flex: "none" } },
                button("Refresh", refresh, false),
                button(auto ? "Live" : "Paused", function () { setAuto(!auto); }, auto)
              )
            ),
            React.createElement("div", {
              style: { flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden", background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }
            },
              view.frameUrl
                ? React.createElement("img", {
                    src: view.frameUrl,
                    alt: "Blockbench viewport",
                    style: { width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated" }
                  })
                : React.createElement("span", { style: { fontSize: 11, opacity: 0.7, padding: 12, textAlign: "center" } },
                    view.error ? view.error : "start Blockbench with the bb-bridge addon")
            ),
            React.createElement("div", { style: { fontSize: 10, opacity: 0.65, display: "flex", justifyContent: "space-between", gap: 8 } },
              React.createElement("span", null, status ? "port " + status.port + " · frames " + status.frames : "bridge " + bridgeBase()),
              React.createElement("span", null, channel && channel.blockbench ? "BB " + channel.blockbench : "")
            )
          );
        }

        function apply(ctx) {
          var service = ctx && ctx.betterSidebar;
          if (!service && ctx && typeof ctx.get === "function") service = ctx.get("betterSidebar");
          if (!service || typeof service.registerTab !== "function") return;
          var register = function () {
            return service.registerTab({
              id: TAB_ID,
              title: function () { return "Blockbench"; },
              icon: function (size) { return React.createElement(CubeIcon, { size: size }); },
              order: 65,
              single: true,
              component: function (props) { return React.createElement(ViewportTab, props); }
            });
          };
          if (ctx && typeof ctx.effect === "function") ctx.effect(register);
          else register();
        }

        exports.name = "dsh-blockbench-atelier";
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
      }
    });
  } catch (error) {
    console.warn("[dsh-blockbench-atelier] client bundle failed:", error);
  }
})();