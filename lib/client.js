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
        var ORBIT_FLUSH_MS = 90;
        var WHEEL_FLUSH_MS = 140;
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
          var viewState = React.useState({ status: null, frameUrl: "", error: null, camera: null });
          var view = viewState[0];
          var setView = viewState[1];
          var autoState = React.useState(true);
          var auto = autoState[0];
          var setAuto = autoState[1];
          var hostRef = React.useRef(null);
          var busyRef = React.useRef(false);

          var load = React.useCallback(function () {
            var base = bridgeBase();
            var stamp = Date.now();
            return fetch(base + "/status.json", { cache: "no-store" })
              .then(function (response) { return response.json(); })
              .then(function (status) {
                setView(function (prev) {
                  return { status: status, frameUrl: base + "/frame.png?t=" + stamp, error: null, camera: status.camera || prev.camera };
                });
              })
              .catch(function (error) {
                setView({ status: null, frameUrl: "", error: String(error && error.message ? error.message : error), camera: null });
              });
          }, []);

          React.useEffect(function () {
            if (visible) load();
          }, [visible, load, scope.sessionId]);

          React.useEffect(function () {
            if (!auto || !visible) return undefined;
            var timer = window.setInterval(function () {
              if (document.visibilityState === "visible" && !busyRef.current) load();
            }, REFRESH_MS);
            return function () { window.clearInterval(timer); };
          }, [auto, visible, load]);

          React.useEffect(function () {
            var host = hostRef.current;
            if (!host) return undefined;
            var drag = { active: false, x: 0, y: 0, dx: 0, dy: 0, timer: 0 };
            var wheel = { sum: 0, timer: 0 };

            function flushOrbit() {
              drag.timer = 0;
              var dx = Math.round(drag.dx);
              var dy = Math.round(drag.dy);
              drag.dx = 0;
              drag.dy = 0;
              if (!dx && !dy) return;
              var base = bridgeBase();
              busyRef.current = true;
              fetch(base + "/orbit?dx=" + dx + "&dy=" + dy, { cache: "no-store" })
                .then(function () { return load(); })
                .catch(function () {})
                .then(function () { busyRef.current = false; });
            }

            function flushWheel() {
              wheel.timer = 0;
              var sum = Math.round(wheel.sum);
              wheel.sum = 0;
              if (!sum) return;
              var base = bridgeBase();
              busyRef.current = true;
              fetch(base + "/zoom?d=" + sum, { cache: "no-store" })
                .then(function () { return load(); })
                .catch(function () {})
                .then(function () { busyRef.current = false; });
            }

            function onDown(event) {
              drag.active = true;
              drag.x = event.clientX;
              drag.y = event.clientY;
              try { host.setPointerCapture(event.pointerId); } catch (error) { void error; }
            }

            function onMove(event) {
              if (!drag.active) return;
              var dx = event.clientX - drag.x;
              var dy = event.clientY - drag.y;
              if (Math.abs(dx) + Math.abs(dy) < 2) return;
              drag.x = event.clientX;
              drag.y = event.clientY;
              drag.dx += dx;
              drag.dy += dy;
              if (!drag.timer) drag.timer = window.setTimeout(flushOrbit, ORBIT_FLUSH_MS);
            }

            function onUp() {
              drag.active = false;
              if (drag.timer) { window.clearTimeout(drag.timer); drag.timer = 0; }
              flushOrbit();
            }

            function onWheel(event) {
              if (event.preventDefault) event.preventDefault();
              wheel.sum += event.deltaY;
              if (!wheel.timer) wheel.timer = window.setTimeout(flushWheel, WHEEL_FLUSH_MS);
            }

            host.addEventListener("pointerdown", onDown);
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            host.addEventListener("wheel", onWheel, { passive: false });
            return function () {
              host.removeEventListener("pointerdown", onDown);
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              host.removeEventListener("wheel", onWheel);
              if (drag.timer) window.clearTimeout(drag.timer);
              if (wheel.timer) window.clearTimeout(wheel.timer);
            };
          }, [load]);

          var sendFit = React.useCallback(function () {
            busyRef.current = true;
            fetch(bridgeBase() + "/fit", { cache: "no-store" })
              .then(function () { return load(); })
              .catch(function () {})
              .then(function () { busyRef.current = false; });
          }, [load]);

          var status = view.status;
          var channel = status && status.channel ? status.channel : null;
          var connected = !!(channel && channel.connected);
          var project = channel && channel.project ? String(channel.project) : "";
          var elements = channel && typeof channel.elements === "number" ? channel.elements : 0;
          var head = connected ? (project || "untitled") + " · " + elements + " parts" : (view.error ? "bridge offline" : "waiting for Blockbench");

          return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8, padding: 10, boxSizing: "border-box" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 } },
              React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } },
                React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", flex: "none" } }),
                React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, head)
              ),
              React.createElement("span", { style: { display: "flex", gap: 6, flex: "none" } },
                button("Fit", sendFit, false),
                button("Refresh", load, false),
                button(auto ? "Live" : "Paused", function () { setAuto(!auto); }, auto)
              )
            ),
            React.createElement("div", {
              ref: hostRef,
              style: {
                flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden",
                background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "grab", touchAction: "none", userSelect: "none"
              }
            },
              view.frameUrl
                ? React.createElement("img", {
                    src: view.frameUrl,
                    alt: "Blockbench viewport",
                    draggable: false,
                    style: { width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", pointerEvents: "none" }
                  })
                : React.createElement("span", { style: { fontSize: 11, opacity: 0.7, padding: 12, textAlign: "center" } },
                    view.error ? view.error : "start Blockbench with the bb-bridge addon")
            ),
            React.createElement("div", { style: { fontSize: 10, opacity: 0.65, display: "flex", justifyContent: "space-between", gap: 8 } },
              React.createElement("span", null, status ? "drag to orbit · wheel to zoom · port " + status.port : "bridge " + bridgeBase()),
              React.createElement("span", null, view.camera ? "r " + Math.round(view.camera.radius) : (channel && channel.blockbench ? "BB " + channel.blockbench : ""))
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