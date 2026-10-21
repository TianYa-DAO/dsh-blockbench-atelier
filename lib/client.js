(function () {
  try {
    window.__ModuleLoader__.load({
      id: "dsh-blockbench-atelier",
      factory: function (require) {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        var React = require("react");
        var inject = ["slots"];
        var LS_KEY = "dsh-blockbench-atelier:bridge";
        var DEFAULT_BRIDGE = "http://127.0.0.1:9879";
        var REFRESH_MS = 1500;

        function bridgeBase() {
          try {
            var stored = window.localStorage.getItem(LS_KEY);
            if (stored) return String(stored).replace(/\/+$/, "");
          } catch (error) {
            void error;
          }
          return DEFAULT_BRIDGE;
        }

        function icon() {
          return React.createElement("svg", {
            width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
            stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
            "aria-hidden": "true"
          },
            React.createElement("path", { d: "M12 2.8 20.4 7.2v9.6L12 21.2 3.6 16.8V7.2z" }),
            React.createElement("path", { d: "M12 2.8v18.4M3.6 7.2 12 11.6l8.4-4.4" })
          );
        }

        function badge(connected, text) {
          var color = connected ? "#22c55e" : "#ef4444";
          return React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
            React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: color, flex: "none" } }),
            React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, text)
          );
        }

        function PanelPage() {
          var viewState = React.useState({ status: null, frameUrl: "", error: null });
          var view = viewState[0];
          var setView = viewState[1];
          var autoState = React.useState(true);
          var auto = autoState[0];
          var setAuto = autoState[1];
          var tickState = React.useState(0);
          var setTick = tickState[1];

          var refresh = React.useCallback(function () {
            var base = bridgeBase();
            var stamp = Date.now();
            fetch(base + "/status.json", { cache: "no-store" })
              .then(function (response) { return response.json(); })
              .then(function (status) {
                setView({ status: status, frameUrl: base + "/frame.png?t=" + stamp, error: null });
              })
              .catch(function (error) {
                setView(function (prev) {
                  return { status: null, frameUrl: "", error: String(error && error.message ? error.message : error) };
                });
              });
          }, []);

          React.useEffect(function () { refresh(); }, [refresh]);

          React.useEffect(function () {
            if (!auto) return undefined;
            var timer = window.setInterval(function () {
              if (document.visibilityState === "visible") { refresh(); setTick(Date.now()); }
            }, REFRESH_MS);
            return function () { window.clearInterval(timer); };
          }, [auto, refresh]);

          var status = view.status;
          var channel = status && status.channel ? status.channel : null;
          var connected = !!(channel && channel.connected);
          var project = channel && channel.project ? String(channel.project) : "no project";
          var elements = channel && typeof channel.elements === "number" ? channel.elements : 0;
          var head = connected ? project + " · " + elements + " parts" : (view.error ? "bridge offline" : "waiting for Blockbench");

          var button = function (label, onClick, active) {
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
          };

          return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8, padding: 10 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 } },
              badge(connected, head),
              React.createElement("span", { style: { display: "flex", gap: 6, flex: "none" } },
                button("Refresh", refresh, false),
                button(auto ? "Live" : "Paused", function () { setAuto(function (value) { return !value; }); }, auto)
              )
            ),
            React.createElement("div", { style: { flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden", background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" } },
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
              React.createElement("span", null, status ? "port " + status.port + " · frames " + status.frames : "port ?"),
              React.createElement("span", null, channel && channel.blockbench ? "BB " + channel.blockbench : "")
            )
          );
        }

        function apply(ctx) {
          if (!ctx || !ctx.slots) return;
          ctx.slots.inject("sidebar.panellist", function () {
            return ctx.slots.register({ name: "sidebar.panellist", id: "bb-atelier", order: 40, label: function () { return "Blockbench"; } }, icon);
          });
          ctx.slots.inject("main", function () {
            return ctx.slots.register({ name: "main", key: "bb-atelier", inject: function () { return {}; } }, PanelPage);
          });
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