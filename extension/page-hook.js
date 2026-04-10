(function () {
  var REGISTRY_KEY = "__PHASER_DEVTOOLS__";
  var PATCH_FLAG = "__PHASER_DEVTOOLS_PATCHED__";
  var BOOT_PATCH_FLAG = "__PHASER_DEVTOOLS_BOOT_PATCHED__";
  var STEP_PATCH_FLAG = "__PHASER_DEVTOOLS_STEP_PATCHED__";
  var MONITOR_INTERVAL_MS = 250;
  var MONITOR_DURATION_MS = 30000;

  function getRegistry() {
    if (!window[REGISTRY_KEY] || typeof window[REGISTRY_KEY] !== "object") {
      window[REGISTRY_KEY] = {
        games: []
      };
    }

    if (!Array.isArray(window[REGISTRY_KEY].games)) {
      window[REGISTRY_KEY].games = [];
    }

    return window[REGISTRY_KEY];
  }

  getRegistry();

  function isGameLike(candidate) {
    return (
      !!candidate &&
      typeof candidate === "object" &&
      !!candidate.scene &&
      (Array.isArray(candidate.scene.scenes) || typeof candidate.scene.getScenes === "function") &&
      !!(candidate.canvas || candidate.renderer || candidate.context)
    );
  }

  function registerGame(game) {
    if (!isGameLike(game)) {
      return;
    }

    var registry = getRegistry();

    if (registry.games.indexOf(game) === -1) {
      registry.games.push(game);
    }
  }

  function patchGamePrototype(GameCtor) {
    if (!GameCtor || !GameCtor.prototype) {
      return;
    }

    var proto = GameCtor.prototype;

    if (typeof proto.boot === "function" && !proto.boot[BOOT_PATCH_FLAG]) {
      var originalBoot = proto.boot;

      proto.boot = function () {
        registerGame(this);
        return originalBoot.apply(this, arguments);
      };

      proto.boot[BOOT_PATCH_FLAG] = true;
    }

    if (typeof proto.step === "function" && !proto.step[STEP_PATCH_FLAG]) {
      var originalStep = proto.step;

      proto.step = function () {
        registerGame(this);
        return originalStep.apply(this, arguments);
      };

      proto.step[STEP_PATCH_FLAG] = true;
    }
  }

  function wrapGameConstructor(phaser) {
    if (!phaser || typeof phaser !== "object" || typeof phaser.Game !== "function") {
      return;
    }

    var CurrentGame = phaser.Game;

    patchGamePrototype(CurrentGame);

    if (CurrentGame[PATCH_FLAG]) {
      return;
    }

    var WrappedGame = new Proxy(CurrentGame, {
      construct: function (target, args, newTarget) {
        var instance = Reflect.construct(target, args, newTarget);
        registerGame(instance);
        return instance;
      },
      apply: function (target, thisArg, args) {
        return Reflect.apply(target, thisArg, args);
      }
    });

    try {
      Object.defineProperty(WrappedGame, "name", {
        value: CurrentGame.name,
        configurable: true
      });
    } catch (error) {
      // Ignore non-critical name assignment failures.
    }

    try {
      Object.setPrototypeOf(WrappedGame, CurrentGame);
    } catch (error) {
      // Ignore prototype assignment failures.
    }

    WrappedGame.prototype = CurrentGame.prototype;
    WrappedGame[PATCH_FLAG] = true;
    WrappedGame.__PHASER_DEVTOOLS_ORIGINAL__ = CurrentGame;

    patchGamePrototype(WrappedGame);

    phaser.Game = WrappedGame;
  }

  function scanKnownCollections(phaser) {
    if (!phaser || typeof phaser !== "object") {
      return;
    }

    var collections = [
      phaser.GAMES,
      phaser.games,
      phaser.Core && phaser.Core.GAMES,
      phaser.Core && phaser.Core.games
    ];

    collections.forEach(function (collection) {
      if (!collection) {
        return;
      }

      if (Array.isArray(collection)) {
        collection.forEach(registerGame);
        return;
      }

      if (typeof collection === "object") {
        Object.keys(collection).forEach(function (key) {
          try {
            registerGame(collection[key]);
          } catch (error) {
            // Ignore collection access issues.
          }
        });
      }
    });
  }

  function instrumentPhaser(phaser) {
    if (!phaser || typeof phaser !== "object") {
      return;
    }

    wrapGameConstructor(phaser);
    scanKnownCollections(phaser);
  }

  function isPhaserPatched(phaser) {
    var GameCtor = phaser && phaser.Game;
    var proto = GameCtor && GameCtor.prototype;

    return !!(
      typeof GameCtor === "function" &&
      proto &&
      proto.boot &&
      proto.step &&
      proto.boot[BOOT_PATCH_FLAG] &&
      proto.step[STEP_PATCH_FLAG]
    );
  }

  function monitorPhaserAvailability() {
    var startTime = Date.now();
    var intervalId = null;

    function tick() {
      try {
        instrumentPhaser(window.Phaser);
      } catch (error) {
        // Ignore instrumentation errors and keep retrying.
      }

      var registry = getRegistry();
      var patched = isPhaserPatched(window.Phaser);
      var timedOut = Date.now() - startTime >= MONITOR_DURATION_MS;

      if ((patched && registry.games.length > 0) || timedOut) {
        clearInterval(intervalId);
      }
    }

    tick();
    intervalId = window.setInterval(tick, MONITOR_INTERVAL_MS);
  }

  function installPhaserPropertyHook() {
    var currentPhaser = window.Phaser;

    if (currentPhaser && currentPhaser.Game && currentPhaser.Game[PATCH_FLAG]) {
      instrumentPhaser(currentPhaser);
      return;
    }

    try {
      Object.defineProperty(window, "Phaser", {
        configurable: true,
        enumerable: true,
        get: function () {
          return currentPhaser;
        },
        set: function (value) {
          currentPhaser = value;
          instrumentPhaser(value);
        }
      });
    } catch (error) {
      // If redefining the global fails, fall back to best-effort immediate instrumentation.
      instrumentPhaser(currentPhaser);
      return;
    }

    if (currentPhaser) {
      instrumentPhaser(currentPhaser);
    }
  }

  installPhaserPropertyHook();
  monitorPhaserAvailability();
})();
