(function () {
  function inspectedPageExecutor(command) {
    function isFiniteNumber(value) {
      return typeof value === "number" && Number.isFinite(value);
    }

    function toNumber(value) {
      return isFiniteNumber(value) ? value : null;
    }

    function toBoolean(value) {
      return value === true || value === false ? value : null;
    }

    function toStringValue(value) {
      return typeof value === "string" && value.length > 0 ? value : null;
    }

    function clampByte(value) {
      var parsed = Number(value);

      if (!Number.isFinite(parsed)) {
        return 0;
      }

      return Math.max(0, Math.min(255, Math.round(parsed)));
    }

    function getRegistry() {
      if (!window.__PHASER_DEVTOOLS__ || typeof window.__PHASER_DEVTOOLS__ !== "object") {
        window.__PHASER_DEVTOOLS__ = { games: [] };
      }

      if (!Array.isArray(window.__PHASER_DEVTOOLS__.games)) {
        window.__PHASER_DEVTOOLS__.games = [];
      }

      if (!window.__PHASER_DEVTOOLS__.uiState || typeof window.__PHASER_DEVTOOLS__.uiState !== "object") {
        window.__PHASER_DEVTOOLS__.uiState = {
          highlight: null,
          overlays: {
            selectedBounds: true,
            allBounds: false,
            origins: false,
            cameraViewport: false,
            cameraWorldView: false,
            sceneKey: null,
            objectPath: null
          },
          pickMode: { enabled: false, sceneKey: null },
          pendingSelection: null,
          objectEditBaselines: {},
          console: { enabled: false, sceneKey: null, objectPath: null }
        };
      }

      if (
        !window.__PHASER_DEVTOOLS__.uiState.overlays ||
        typeof window.__PHASER_DEVTOOLS__.uiState.overlays !== "object"
      ) {
        window.__PHASER_DEVTOOLS__.uiState.overlays = {};
      }

      if (
        !window.__PHASER_DEVTOOLS__.uiState.objectEditBaselines ||
        typeof window.__PHASER_DEVTOOLS__.uiState.objectEditBaselines !== "object"
      ) {
        window.__PHASER_DEVTOOLS__.uiState.objectEditBaselines = {};
      }

      if (
        !window.__PHASER_DEVTOOLS__.uiState.console ||
        typeof window.__PHASER_DEVTOOLS__.uiState.console !== "object"
      ) {
        window.__PHASER_DEVTOOLS__.uiState.console = {
          enabled: false,
          sceneKey: null,
          objectPath: null
        };
      }

      if (
        !window.__PHASER_DEVTOOLS__.originalTextureUrls ||
        typeof window.__PHASER_DEVTOOLS__.originalTextureUrls !== "object"
      ) {
        window.__PHASER_DEVTOOLS__.originalTextureUrls = {};
      }

      if (!Array.isArray(window.__PHASER_DEVTOOLS__.loaderEvents)) {
        window.__PHASER_DEVTOOLS__.loaderEvents = [];
      }

      return window.__PHASER_DEVTOOLS__;
    }

    function getRendererType(game) {
      var rendererType = game && game.renderer ? game.renderer.type : null;

      if (typeof rendererType === "string") {
        return rendererType;
      }

      if (rendererType === null || rendererType === undefined) {
        return null;
      }

      if (typeof window.Phaser === "object") {
        if (rendererType === window.Phaser.AUTO) {
          return "AUTO";
        }

        if (rendererType === window.Phaser.CANVAS) {
          return "CANVAS";
        }

        if (rendererType === window.Phaser.WEBGL) {
          return "WEBGL";
        }

        if (rendererType === window.Phaser.HEADLESS) {
          return "HEADLESS";
        }
      }

      return String(rendererType);
    }

    function isGameLike(candidate) {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }

      try {
        if (window.Phaser && typeof window.Phaser.Game === "function" && candidate instanceof window.Phaser.Game) {
          return true;
        }
      } catch (error) {
        // Ignore instanceof issues and fall back to shape checks.
      }

      var hasSceneManager =
        candidate.scene &&
        (Array.isArray(candidate.scene.scenes) || typeof candidate.scene.getScenes === "function");

      var hasRenderingSurface = !!candidate.canvas || !!candidate.context || !!candidate.renderer;
      var hasSizeInfo =
        !!(candidate.scale && (candidate.scale.width || candidate.scale.height)) ||
        !!candidate.config ||
        !!candidate.canvas;

      return !!hasSceneManager && !!hasRenderingSurface && !!hasSizeInfo;
    }

    function findGameInCollection(collection) {
      var index;

      if (!collection) {
        return null;
      }

      if (Array.isArray(collection)) {
        for (index = 0; index < collection.length; index += 1) {
          if (isGameLike(collection[index])) {
            return collection[index];
          }
        }

        return null;
      }

      if (typeof collection === "object") {
        var keys;

        try {
          keys = Object.keys(collection);
        } catch (error) {
          keys = [];
        }

        for (index = 0; index < keys.length; index += 1) {
          var key = keys[index];

          try {
            if (isGameLike(collection[key])) {
              return collection[key];
            }
          } catch (error) {
            // Ignore property access errors and keep scanning.
          }
        }
      }

      return null;
    }

    function findGameFromWindowProperties() {
      var propertyNames;

      try {
        propertyNames = Object.getOwnPropertyNames(window);
      } catch (error) {
        propertyNames = [];
      }

      for (var index = 0; index < propertyNames.length; index += 1) {
        var propertyName = propertyNames[index];

        try {
          if (isGameLike(window[propertyName])) {
            return window[propertyName];
          }
        } catch (error) {
          // Ignore inaccessible properties.
        }
      }

      return null;
    }

    function findGameFromPhaserNamespace() {
      if (!window.Phaser || typeof window.Phaser !== "object") {
        return null;
      }

      var phaser = window.Phaser;
      var directCollections = [
        phaser.GAMES,
        phaser.games,
        phaser.GameInstances,
        phaser.Instances,
        phaser._games,
        phaser.Core && phaser.Core.GAMES,
        phaser.Core && phaser.Core.games
      ];

      for (var index = 0; index < directCollections.length; index += 1) {
        var directMatch = findGameInCollection(directCollections[index]);

        if (directMatch) {
          return directMatch;
        }
      }

      var phaserKeys;

      try {
        phaserKeys = Object.keys(phaser);
      } catch (error) {
        phaserKeys = [];
      }

      for (var keyIndex = 0; keyIndex < phaserKeys.length; keyIndex += 1) {
        var key = phaserKeys[keyIndex];
        var value;

        try {
          value = phaser[key];
        } catch (error) {
          continue;
        }

        if (isGameLike(value)) {
          return value;
        }

        if (value && typeof value === "object") {
          var nestedMatch = findGameInCollection(value);

          if (nestedMatch) {
            return nestedMatch;
          }
        }
      }

      return null;
    }

    function findGame() {
      var registry = getRegistry();
      var injectedMatch = findGameInCollection(registry.games);

      if (injectedMatch) {
        return injectedMatch;
      }

      var directCandidates = [
        window.game,
        window.__PHASER_GAME__,
        window.phaserGame,
        window.__phaserGame__,
        window.gameInstance
      ];

      for (var index = 0; index < directCandidates.length; index += 1) {
        if (isGameLike(directCandidates[index])) {
          return directCandidates[index];
        }
      }

      var phaserMatch = findGameFromPhaserNamespace();

      if (phaserMatch) {
        return phaserMatch;
      }

      return findGameFromWindowProperties();
    }

    function getScenes(game) {
      if (!game || !game.scene) {
        return [];
      }

      if (Array.isArray(game.scene.scenes)) {
        return game.scene.scenes;
      }

      if (typeof game.scene.getScenes === "function") {
        try {
          var scenes = game.scene.getScenes();

          if (Array.isArray(scenes)) {
            return scenes;
          }
        } catch (error) {
          // Ignore and fall back below.
        }
      }

      return [];
    }

    function getSceneByKey(game, sceneKey) {
      var scenes = getScenes(game);

      for (var index = 0; index < scenes.length; index += 1) {
        var scene = scenes[index];
        var key = scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : null;

        if (key === sceneKey) {
          return scene;
        }
      }

      return null;
    }

    function getSceneVisibility(scene) {
      if (!scene || !scene.sys) {
        return null;
      }

      if (typeof scene.sys.isVisible === "function") {
        try {
          return toBoolean(scene.sys.isVisible());
        } catch (error) {
          // Ignore and fall back below.
        }
      }

      return toBoolean(scene.sys.settings && scene.sys.settings.visible);
    }

    function getSceneActive(scene) {
      if (!scene || !scene.sys) {
        return null;
      }

      if (typeof scene.sys.isActive === "function") {
        try {
          return toBoolean(scene.sys.isActive());
        } catch (error) {
          // Ignore and fall back below.
        }
      }

      return toBoolean(scene.sys.settings && scene.sys.settings.active);
    }

    function getSceneStatus(scene) {
      if (!scene || !scene.sys) {
        return null;
      }

      var directStatus = toNumber(scene.sys.status);

      if (directStatus !== null) {
        return directStatus;
      }

      return toNumber(scene.sys.settings && scene.sys.settings.status);
    }

    function getSceneStatusLabel(scene) {
      var status = getSceneStatus(scene);

      if (status === null || !window.Phaser || !window.Phaser.Scenes) {
        return null;
      }

      var sceneNamespace = window.Phaser.Scenes;
      var keys;

      try {
        keys = Object.keys(sceneNamespace);
      } catch (error) {
        keys = [];
      }

      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];

        if (sceneNamespace[key] === status && key === key.toUpperCase()) {
          return key;
        }
      }

      return String(status);
    }

    function getScenePaused(scene) {
      if (!scene || !scene.sys) {
        return null;
      }

      if (typeof scene.sys.isPaused === "function") {
        try {
          return toBoolean(scene.sys.isPaused());
        } catch (error) {
          // Ignore and fall back below.
        }
      }

      return getSceneStatusLabel(scene) === "PAUSED";
    }

    function getSceneSleeping(scene) {
      if (!scene || !scene.sys) {
        return null;
      }

      if (typeof scene.sys.isSleeping === "function") {
        try {
          return toBoolean(scene.sys.isSleeping());
        } catch (error) {
          // Ignore and fall back below.
        }
      }

      return getSceneStatusLabel(scene) === "SLEEPING";
    }

    function serializeLoaderFile(file) {
      if (!file || typeof file !== "object") {
        return null;
      }

      return {
        key: toStringValue(file.key),
        type: toStringValue(file.type),
        url:
          toStringValue(file.url) ||
          toStringValue(file.src) ||
          toStringValue(file.path && file.url ? String(file.path) + String(file.url) : null),
        state: toStringValue(file.state) || (file.state !== null && file.state !== undefined ? String(file.state) : null),
        error:
          toStringValue(file.error) ||
          toStringValue(file.errorMessage) ||
          toStringValue(file.xhrLoader && file.xhrLoader.statusText),
        percentComplete: toNumber(file.percentComplete),
        bytesLoaded: toNumber(file.bytesLoaded),
        bytesTotal: toNumber(file.bytesTotal)
      };
    }

    function rememberOriginalTextureUrl(file) {
      var serialized = serializeLoaderFile(file);
      var registry = getRegistry();
      var key = serialized && serialized.key;
      var url = serialized && serialized.url;

      if (!key || !url || url.indexOf("blob:") === 0) {
        return;
      }

      registry.originalTextureUrls[key] = url;
    }

    function rememberLoaderEvent(eventName, file) {
      var serialized = serializeLoaderFile(file);
      var registry = getRegistry();

      if (!serialized || (!serialized.key && !serialized.url)) {
        return;
      }

      registry.loaderEvents.push({
        event: eventName,
        key: serialized.key,
        type: serialized.type,
        url: serialized.url,
        state: serialized.state,
        error: serialized.error,
        time: Date.now()
      });

      if (registry.loaderEvents.length > 80) {
        registry.loaderEvents.splice(0, registry.loaderEvents.length - 80);
      }
    }

    function collectLoaderFilesFromCollection(collection, results, seen) {
      if (!collection) {
        return;
      }

      if (Array.isArray(collection)) {
        collection.forEach(function (file) {
          var serialized = serializeLoaderFile(file);

          if (!serialized) {
            return;
          }

          rememberOriginalTextureUrl(file);
          rememberLoaderEvent("snapshot", file);

          var key = [serialized.type, serialized.key, serialized.url, serialized.state].join("::");

          if (seen[key]) {
            return;
          }

          seen[key] = true;
          results.push(serialized);
        });
        return;
      }

      if (typeof collection.each === "function") {
        try {
          collection.each(function (file) {
            collectLoaderFilesFromCollection([file], results, seen);
          });
          return;
        } catch (error) {
          // Fall through to object scanning.
        }
      }

      if (typeof collection.entries === "function") {
        try {
          collectLoaderFilesFromCollection(Array.from(collection.entries()), results, seen);
          return;
        } catch (error) {
          // Fall through to object scanning.
        }
      }

      if (typeof collection.entries === "object") {
        try {
          collectLoaderFilesFromCollection(Array.from(collection.entries), results, seen);
          return;
        } catch (error) {
          // Fall through to object scanning.
        }
      }

      if (typeof collection === "object") {
        Object.keys(collection).forEach(function (key) {
          try {
            collectLoaderFilesFromCollection([collection[key]], results, seen);
          } catch (error) {
            // Ignore inaccessible loader internals.
          }
        });
      }
    }

    function collectLoaderFileGroup(loader, names) {
      var results = [];
      var seen = {};

      names.forEach(function (name) {
        try {
          collectLoaderFilesFromCollection(loader && loader[name], results, seen);
        } catch (error) {
          // Loader internals vary by Phaser version.
        }
      });

      return results;
    }

    function attachLoaderUrlTracker(loader) {
      if (!loader || loader.__PHASER_DEVTOOLS_URL_TRACKED__) {
        return;
      }

      loader.__PHASER_DEVTOOLS_URL_TRACKED__ = true;

      if (typeof loader.on === "function") {
        ["filecomplete", "load", "addfile", "loaderror"].forEach(function (eventName) {
          try {
            loader.on(eventName, function () {
              for (var index = 0; index < arguments.length; index += 1) {
                if (arguments[index] && typeof arguments[index] === "object") {
                  rememberOriginalTextureUrl(arguments[index]);
                  rememberLoaderEvent(eventName, arguments[index]);
                }
              }
            });
          } catch (error) {
            // Loader event signatures vary by Phaser version.
          }
        });
      }
    }

    function serializeLoad(scene) {
      var loader = scene && scene.load ? scene.load : null;
      var registry = getRegistry();
      var progress = toNumber(loader && loader.progress);
      var totalComplete = toNumber(loader && loader.totalComplete);
      var totalFailed = toNumber(loader && loader.totalFailed);
      var totalToLoad = toNumber(loader && loader.totalToLoad);
      var isLoading = null;

      if (loader && typeof loader.isLoading === "function") {
        attachLoaderUrlTracker(loader);

        try {
          isLoading = toBoolean(loader.isLoading());
        } catch (error) {
          isLoading = null;
        }
      }

      if (isLoading === null && loader && typeof loader.isReady === "function") {
        try {
          isLoading = !loader.isReady();
        } catch (error) {
          isLoading = null;
        }
      }

      if (isLoading === null && progress !== null) {
        isLoading = progress > 0 && progress < 1;
      }

      return {
        progress: progress,
        totalComplete: totalComplete,
        totalFailed: totalFailed,
        totalToLoad: totalToLoad,
        isLoading: isLoading,
        files: {
          pending: collectLoaderFileGroup(loader, ["list", "queue", "pendingFiles", "_pending"]),
          inflight: collectLoaderFileGroup(loader, ["inflight", "inflightQueue", "_inflight"]),
          failed: collectLoaderFileGroup(loader, ["failed", "failedFiles", "_failed"])
        },
        events: registry.loaderEvents.slice(-30)
      };
    }

    function componentToHex(value) {
      var hex = clampByte(value).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }

    function serializeColor(value) {
      if (typeof value === "string") {
        return value;
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        return "#" + ("000000" + (value >>> 0).toString(16)).slice(-6);
      }

      if (value && typeof value === "object") {
        if (typeof value.rgba === "string" && value.rgba.length > 0) {
          return value.rgba;
        }

        if (isFiniteNumber(value.color)) {
          return "#" + ("000000" + (value.color >>> 0).toString(16)).slice(-6);
        }

        if (isFiniteNumber(value.r) && isFiniteNumber(value.g) && isFiniteNumber(value.b)) {
          return "#" + componentToHex(value.r) + componentToHex(value.g) + componentToHex(value.b);
        }
      }

      return null;
    }

    function getCameraOrigin(camera, axis) {
      var directOrigin;

      if (!camera) {
        return null;
      }

      if (axis === "x") {
        directOrigin = toNumber(camera.originX);

        if (directOrigin !== null) {
          return directOrigin;
        }

        return toNumber(camera.origin && camera.origin.x);
      }

      directOrigin = toNumber(camera.originY);

      if (directOrigin !== null) {
        return directOrigin;
      }

      return toNumber(camera.origin && camera.origin.y);
    }

    function getSceneCameraCount(scene) {
      if (!scene || !scene.cameras) {
        return 0;
      }

      if (Array.isArray(scene.cameras.cameras)) {
        return scene.cameras.cameras.filter(function (camera) {
          return !!camera;
        }).length;
      }

      if (scene.cameras.main) {
        return 1;
      }

      return 0;
    }

    function serializeCamera(camera, scene) {
      var worldView = camera && camera.worldView ? camera.worldView : null;
      var cameraCount = getSceneCameraCount(scene);

      if (!camera) {
        return null;
      }

      return {
        name: toStringValue(camera.name) || "Main Camera",
        x: toNumber(camera.x),
        y: toNumber(camera.y),
        width: toNumber(camera.width),
        height: toNumber(camera.height),
        scrollX: toNumber(camera.scrollX),
        scrollY: toNumber(camera.scrollY),
        zoom: toNumber(camera.zoom),
        rotation: toNumber(camera.rotation),
        roundPixels: toBoolean(camera.roundPixels),
        visible: toBoolean(camera.visible),
        backgroundColor: serializeColor(camera.backgroundColor),
        alpha: toNumber(camera.alpha),
        originX: getCameraOrigin(camera, "x"),
        originY: getCameraOrigin(camera, "y"),
        centerX: toNumber(camera.centerX),
        centerY: toNumber(camera.centerY),
        worldViewX: toNumber(worldView && worldView.x),
        worldViewY: toNumber(worldView && worldView.y),
        worldViewWidth: toNumber(worldView && worldView.width),
        worldViewHeight: toNumber(worldView && worldView.height),
        cameraCount: cameraCount,
        actions: {
          fadeIn: typeof camera.fadeIn === "function",
          fadeOut: typeof camera.fadeOut === "function" || typeof camera.fade === "function",
          flash: typeof camera.flash === "function",
          resetFX: typeof camera.resetFX === "function",
          shake: typeof camera.shake === "function",
          destroy: cameraCount > 1 && !!(scene && scene.cameras && typeof scene.cameras.remove === "function")
        }
      };
    }

    function serializeVector(vector) {
      if (!vector || typeof vector !== "object") {
        return null;
      }

      return {
        x: toNumber(vector.x),
        y: toNumber(vector.y)
      };
    }

    function serializeArcadeWorld(scene) {
      var physics = scene && scene.physics ? scene.physics : null;
      var world = physics && physics.world ? physics.world : null;
      var bounds = world && world.bounds ? world.bounds : null;

      if (!world) {
        return null;
      }

      return {
        system: "arcade",
        paused: toBoolean(world.isPaused) || toBoolean(world.pause),
        gravity: serializeVector(world.gravity),
        bounds: bounds
          ? {
              x: toNumber(bounds.x),
              y: toNumber(bounds.y),
              width: toNumber(bounds.width),
              height: toNumber(bounds.height)
            }
          : null,
        bodiesCount: world.bodies && typeof world.bodies.size === "number" ? world.bodies.size : null,
        staticBodiesCount:
          world.staticBodies && typeof world.staticBodies.size === "number" ? world.staticBodies.size : null
      };
    }

    function serializeArcadeBody(body) {
      if (!body || typeof body !== "object") {
        return null;
      }

      return {
        system: "arcade",
        enabled: toBoolean(body.enable),
        x: toNumber(body.x),
        y: toNumber(body.y),
        width: toNumber(body.width),
        height: toNumber(body.height),
        velocity: serializeVector(body.velocity),
        acceleration: serializeVector(body.acceleration),
        gravity: serializeVector(body.gravity),
        immovable: toBoolean(body.immovable),
        allowGravity: toBoolean(body.allowGravity),
        moves: toBoolean(body.moves),
        blocked: body.blocked
          ? {
              up: toBoolean(body.blocked.up),
              down: toBoolean(body.blocked.down),
              left: toBoolean(body.blocked.left),
              right: toBoolean(body.blocked.right)
            }
          : null,
        touching: body.touching
          ? {
              up: toBoolean(body.touching.up),
              down: toBoolean(body.touching.down),
              left: toBoolean(body.touching.left),
              right: toBoolean(body.touching.right)
            }
          : null
      };
    }

    function serializePhysics(scene, displayObject) {
      return {
        world: serializeArcadeWorld(scene),
        selectedBody: displayObject ? serializeArcadeBody(displayObject.body) : null
      };
    }

    function getSceneActions(scene) {
      var statusLabel = getSceneStatusLabel(scene);
      var active = getSceneActive(scene) === true;
      var paused = getScenePaused(scene) === true;
      var sleeping = getSceneSleeping(scene) === true;
      var destroyed = statusLabel === "DESTROYED";
      var stopped = statusLabel === "SHUTDOWN";

      return {
        pause: active && !paused && !sleeping && !destroyed,
        resume: paused && !destroyed,
        sleep: active && !sleeping && !destroyed,
        wake: sleeping && !destroyed,
        stop: !destroyed && !stopped && (active || paused || sleeping || statusLabel === "RUNNING"),
        restart: !destroyed && !stopped,
        remove: !destroyed
      };
    }

    function serializeScene(scene) {
      var sceneSettings = scene && scene.sys ? scene.sys.settings : null;

      return {
        key: sceneSettings && sceneSettings.key ? sceneSettings.key : "(unnamed scene)",
        active: getSceneActive(scene),
        visible: getSceneVisibility(scene),
        status: getSceneStatus(scene),
        statusLabel: getSceneStatusLabel(scene),
        isPaused: getScenePaused(scene),
        isSleeping: getSceneSleeping(scene),
        load: serializeLoad(scene),
        camera: serializeCamera(scene && scene.cameras ? scene.cameras.main : null, scene),
        physics: serializePhysics(scene, null),
        sceneActions: getSceneActions(scene)
      };
    }

    function serializeFps(game) {
      var loop = game && game.loop ? game.loop : null;
      var config = game && game.config ? game.config : null;
      var fpsConfig = config && config.fps ? config.fps : null;

      return {
        actualFps: toNumber(loop && loop.actualFps),
        targetFps: toNumber(loop && loop.targetFps) || toNumber(fpsConfig && fpsConfig.target),
        fpsLimit: toNumber(loop && loop.fpsLimit) || toNumber(fpsConfig && fpsConfig.limit),
        delta: toNumber(loop && loop.delta),
        rawDelta: toNumber(loop && loop.rawDelta)
      };
    }

    function getDisplayList(scene) {
      if (!scene) {
        return [];
      }

      if (scene.sys && scene.sys.displayList && Array.isArray(scene.sys.displayList.list)) {
        return scene.sys.displayList.list;
      }

      if (scene.children && Array.isArray(scene.children.list)) {
        return scene.children.list;
      }

      return [];
    }

    function getObjectChildren(displayObject) {
      if (!displayObject || typeof displayObject !== "object") {
        return [];
      }

      if (Array.isArray(displayObject.list)) {
        return displayObject.list;
      }

      if (displayObject.children && Array.isArray(displayObject.children.list)) {
        return displayObject.children.list;
      }

      if (Array.isArray(displayObject.children)) {
        return displayObject.children;
      }

      return [];
    }

    function getObjectType(displayObject) {
      return (
        toStringValue(displayObject && displayObject.type) ||
        toStringValue(displayObject && displayObject.constructor && displayObject.constructor.name) ||
        "Unknown"
      );
    }

    function getTextureKey(displayObject) {
      if (!displayObject) {
        return null;
      }

      if (displayObject.texture && typeof displayObject.texture.key === "string") {
        return displayObject.texture.key;
      }

      if (displayObject.frame && displayObject.frame.texture && typeof displayObject.frame.texture.key === "string") {
        return displayObject.frame.texture.key;
      }

      return null;
    }

    function getTextureFrameMap(texture) {
      if (!texture || typeof texture !== "object") {
        return {};
      }

      return texture.frames && typeof texture.frames === "object" ? texture.frames : {};
    }

    function getTextureKeys(textureManager) {
      if (!textureManager || typeof textureManager !== "object") {
        return [];
      }

      if (typeof textureManager.getTextureKeys === "function") {
        try {
          var keys = textureManager.getTextureKeys();

          if (Array.isArray(keys)) {
            return keys.filter(function (key) {
              return typeof key === "string" && key.length > 0;
            });
          }
        } catch (error) {
          // Fall back to manager internals below.
        }
      }

      if (textureManager.list && typeof textureManager.list === "object") {
        return Object.keys(textureManager.list);
      }

      return [];
    }

    function getTextureByKey(textureManager, textureKey) {
      if (!textureManager || !textureKey) {
        return null;
      }

      if (typeof textureManager.get === "function") {
        try {
          return textureManager.get(textureKey);
        } catch (error) {
          // Fall back below.
        }
      }

      return textureManager.list && textureManager.list[textureKey] ? textureManager.list[textureKey] : null;
    }

    function getTextureSource(texture) {
      if (!texture) {
        return null;
      }

      if (Array.isArray(texture.source) && texture.source.length > 0) {
        return texture.source[0];
      }

      return texture.source || null;
    }

    function getTexturePreviewCandidates(source) {
      var candidates = [];

      if (!source) {
        return candidates;
      }

      [
        source.image,
        source.source,
        source.data,
        source.dataSource,
        source.canvas,
        source.context && source.context.canvas,
        source.image && source.image.canvas
      ].forEach(function (candidate) {
        if (candidate && candidates.indexOf(candidate) === -1) {
          candidates.push(candidate);
        }
      });

      return candidates;
    }

    function getImageUrl(image) {
      if (!image) {
        return null;
      }

      if (typeof image.currentSrc === "string" && image.currentSrc.length > 0) {
        return image.currentSrc;
      }

      if (typeof image.src === "string" && image.src.length > 0) {
        return image.src;
      }

      return null;
    }

    function getImagePreviewDataUrl(source, image) {
      if (!image || typeof document !== "object" || typeof document.createElement !== "function") {
        return null;
      }

      try {
        var width =
          toNumber(source && source.width) ||
          toNumber(image.naturalWidth) ||
          toNumber(image.videoWidth) ||
          toNumber(image.width);
        var height =
          toNumber(source && source.height) ||
          toNumber(image.naturalHeight) ||
          toNumber(image.videoHeight) ||
          toNumber(image.height);

        if (!width || !height) {
          return null;
        }

        var maxSize = 256;
        var scale = Math.min(1, maxSize / Math.max(width, height));
        var canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      } catch (error) {
        return null;
      }
    }

    function getTexturePreview(source, preferDataUrl) {
      var candidates = getTexturePreviewCandidates(source);
      var index;
      var preview;

      if (preferDataUrl) {
        for (index = 0; index < candidates.length; index += 1) {
          preview = getImagePreviewDataUrl(source, candidates[index]);

          if (preview) {
            return preview;
          }
        }
      }

      for (index = 0; index < candidates.length; index += 1) {
        preview = getImageUrl(candidates[index]);

        if (preview) {
          return preview;
        }
      }

      if (!preferDataUrl) {
        for (index = 0; index < candidates.length; index += 1) {
          preview = getImagePreviewDataUrl(source, candidates[index]);

          if (preview) {
            return preview;
          }
        }
      }

      return null;
    }

    function getTexturePreviewStatus(source, preview) {
      var candidates = getTexturePreviewCandidates(source);
      var sourceTypes = candidates.map(function (candidate) {
        return (
          toStringValue(candidate && candidate.tagName) ||
          toStringValue(candidate && candidate.constructor && candidate.constructor.name) ||
          "Object"
        );
      });

      if (!preview) {
        return {
          state: "unavailable",
          detail: candidates.length > 0
            ? "Found " + candidates.length + " source candidate(s), but none were drawable/readable."
            : "No image/canvas source candidate found.",
          sourceTypes: sourceTypes
        };
      }

      if (preview.indexOf("data:image/") === 0) {
        return {
          state: "thumbnail",
          detail: "Generated a readable thumbnail from the texture source.",
          sourceTypes: sourceTypes
        };
      }

      if (preview.indexOf("blob:") === 0) {
        return {
          state: "blob-url",
          detail: "Only a blob URL was available; Chrome may block it in the extension panel.",
          sourceTypes: sourceTypes
        };
      }

      return {
        state: "source-url",
        detail: "Using the browser image source URL directly.",
        sourceTypes: sourceTypes
      };
    }

    function getTextureSourceUrl(source) {
      var candidates = getTexturePreviewCandidates(source);
      var index;
      var url;

      for (index = 0; index < candidates.length; index += 1) {
        url = getImageUrl(candidates[index]);

        if (url) {
          return url;
        }
      }

      if (source && typeof source.url === "string" && source.url.length > 0) {
        return source.url;
      }

      return null;
    }

    function getTextureOriginalUrl(textureKey, sourceUrl) {
      var registry = getRegistry();

      if (textureKey && registry.originalTextureUrls[textureKey]) {
        return registry.originalTextureUrls[textureKey];
      }

      if (sourceUrl && sourceUrl.indexOf("blob:") !== 0) {
        return sourceUrl;
      }

      return null;
    }

    function serializeTextureFrame(frameName, frame) {
      return {
        name: frameName,
        width: toNumber(frame && (frame.width || frame.cutWidth || frame.realWidth)),
        height: toNumber(frame && (frame.height || frame.cutHeight || frame.realHeight)),
        x: toNumber(frame && (frame.x || frame.cutX)),
        y: toNumber(frame && (frame.y || frame.cutY))
      };
    }

    function countTextureUsage(game, textureKey) {
      var count = 0;

      getScenes(game).forEach(function (scene) {
        var objects = [];

        flattenSceneObjects(
          scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : null,
          getDisplayList(scene),
          0,
          [],
          objects
        );

        objects.forEach(function (summary) {
          if (summary.textureKey === textureKey) {
            count += 1;
          }
        });
      });

      return count;
    }

    function serializeTextureSummary(game, textureKey) {
      var textureManager = game && game.textures ? game.textures : null;
      var texture = getTextureByKey(textureManager, textureKey);
      var source = getTextureSource(texture);
      var frameMap = getTextureFrameMap(texture);

      return {
        key: textureKey,
        sourceCount: Array.isArray(texture && texture.source) ? texture.source.length : texture && texture.source ? 1 : 0,
        frameCount: Object.keys(frameMap).length,
        width: toNumber(source && (source.width || source.image && source.image.width)),
        height: toNumber(source && (source.height || source.image && source.image.height)),
        usageCount: countTextureUsage(game, textureKey)
      };
    }

    function serializeTextureDetails(game, textureKey) {
      var summary = serializeTextureSummary(game, textureKey);
      var textureManager = game && game.textures ? game.textures : null;
      var texture = getTextureByKey(textureManager, textureKey);
      var frameMap = getTextureFrameMap(texture);

      summary.frames = Object.keys(frameMap).map(function (frameName) {
        return serializeTextureFrame(frameName, frameMap[frameName]);
      });
      var textureSource = getTextureSource(texture);

      summary.preview = getTexturePreview(textureSource, true);
      summary.previewStatus = getTexturePreviewStatus(textureSource, summary.preview);
      summary.sourceUrl = getTextureSourceUrl(textureSource);
      summary.originalUrl = getTextureOriginalUrl(textureKey, summary.sourceUrl);

      return summary;
    }

    function pathToString(pathSegments) {
      return pathSegments.join(".");
    }

    function parseObjectPath(objectPath) {
      if (typeof objectPath !== "string" || objectPath.length === 0) {
        return [];
      }

      return objectPath
        .split(".")
        .map(function (segment) {
          return Number(segment);
        })
        .filter(function (segment) {
          return Number.isInteger(segment) && segment >= 0;
        });
    }

    function serializeDisplayObjectSummary(sceneKey, displayObject, pathSegments, depth) {
      var childCount = getObjectChildren(displayObject).length;
      var objectPath = pathToString(pathSegments);
      var baseline = getObjectEditBaseline(sceneKey, objectPath);

      return {
        path: objectPath,
        depth: depth,
        name: toStringValue(displayObject && displayObject.name),
        type: getObjectType(displayObject),
        textureKey: getTextureKey(displayObject),
        x: toNumber(displayObject && displayObject.x),
        y: toNumber(displayObject && displayObject.y),
        visible: toBoolean(displayObject && displayObject.visible),
        childCount: childCount,
        changed: hasChangedEditableProperties(displayObject, baseline)
      };
    }

    function getObjectEditBaselineKey(sceneKey, objectPath) {
      return String(sceneKey || "") + "::" + String(objectPath || "");
    }

    function getEditableObjectSnapshot(displayObject) {
      if (!displayObject) {
        return null;
      }

      return {
        x: toNumber(displayObject.x),
        y: toNumber(displayObject.y),
        scaleX: toNumber(displayObject.scaleX),
        scaleY: toNumber(displayObject.scaleY),
        alpha: toNumber(displayObject.alpha),
        visible: toBoolean(displayObject.visible),
        rotation: toNumber(displayObject.rotation)
      };
    }

    function getChangedEditableProperties(displayObject, baseline) {
      var current = getEditableObjectSnapshot(displayObject);
      var changed = {};

      if (!current || !baseline) {
        return changed;
      }

      Object.keys(current).forEach(function (property) {
        if (current[property] !== baseline[property]) {
          changed[property] = true;
        }
      });

      return changed;
    }

    function hasChangedEditableProperties(displayObject, baseline) {
      return Object.keys(getChangedEditableProperties(displayObject, baseline)).length > 0;
    }

    function reconcileObjectEditBaseline(sceneKey, objectPath, displayObject) {
      var baseline = getObjectEditBaseline(sceneKey, objectPath);

      if (baseline && !hasChangedEditableProperties(displayObject, baseline)) {
        clearObjectEditBaseline(sceneKey, objectPath);
      }
    }

    function captureObjectEditBaseline(sceneKey, objectPath, displayObject) {
      var registry = getRegistry();
      var baselineKey = getObjectEditBaselineKey(sceneKey, objectPath);

      if (registry.uiState.objectEditBaselines[baselineKey]) {
        return;
      }

      registry.uiState.objectEditBaselines[baselineKey] = getEditableObjectSnapshot(displayObject);
    }

    function getObjectEditBaseline(sceneKey, objectPath) {
      var registry = getRegistry();
      return registry.uiState.objectEditBaselines[getObjectEditBaselineKey(sceneKey, objectPath)] || null;
    }

    function clearObjectEditBaseline(sceneKey, objectPath) {
      var registry = getRegistry();
      delete registry.uiState.objectEditBaselines[getObjectEditBaselineKey(sceneKey, objectPath)];
    }

    function applyEditableObjectSnapshot(displayObject, snapshot) {
      if (!displayObject || !snapshot) {
        return;
      }

      if (snapshot.visible === true || snapshot.visible === false) {
        if (typeof displayObject.setVisible === "function") {
          displayObject.setVisible(snapshot.visible);
        } else {
          displayObject.visible = snapshot.visible;
        }
      }

      ["x", "y", "scaleX", "scaleY", "alpha", "rotation"].forEach(function (property) {
        if (typeof snapshot[property] === "number" && Number.isFinite(snapshot[property])) {
          displayObject[property] = snapshot[property];
        }
      });
    }

    function serializeDisplayObjectDetails(sceneKey, displayObject, objectPath) {
      if (!displayObject) {
        return null;
      }

      var baseline = getObjectEditBaseline(sceneKey, objectPath);

      return {
        path: objectPath,
        name: toStringValue(displayObject.name),
        type: getObjectType(displayObject),
        x: toNumber(displayObject.x),
        y: toNumber(displayObject.y),
        scaleX: toNumber(displayObject.scaleX),
        scaleY: toNumber(displayObject.scaleY),
        alpha: toNumber(displayObject.alpha),
        visible: toBoolean(displayObject.visible),
        rotation: toNumber(displayObject.rotation),
        textureKey: getTextureKey(displayObject),
        childCount: getObjectChildren(displayObject).length,
        physicsBody: serializeArcadeBody(displayObject.body),
        originalValues: baseline,
        changedProperties: getChangedEditableProperties(displayObject, baseline),
        canReset: !!baseline
      };
    }

    function flattenSceneObjects(sceneKey, objects, depth, parentPathSegments, results) {
      for (var index = 0; index < objects.length; index += 1) {
        var displayObject = objects[index];
        var pathSegments = parentPathSegments.concat(index);

        results.push(serializeDisplayObjectSummary(sceneKey, displayObject, pathSegments, depth));
        flattenSceneObjects(sceneKey, getObjectChildren(displayObject), depth + 1, pathSegments, results);
      }
    }

    function getDisplayObjectByPath(scene, objectPath) {
      var pathSegments = parseObjectPath(objectPath);
      var currentList = getDisplayList(scene);
      var currentObject = null;

      for (var index = 0; index < pathSegments.length; index += 1) {
        var segment = pathSegments[index];

        if (!Array.isArray(currentList) || segment < 0 || segment >= currentList.length) {
          return null;
        }

        currentObject = currentList[segment];
        currentList = getObjectChildren(currentObject);
      }

      return currentObject;
    }

    function pointInBounds(bounds, x, y) {
      if (!bounds) {
        return false;
      }

      return (
        isFiniteNumber(bounds.x) &&
        isFiniteNumber(bounds.y) &&
        isFiniteNumber(bounds.width) &&
        isFiniteNumber(bounds.height) &&
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      );
    }

    function getObjectBounds(displayObject) {
      if (!displayObject || typeof displayObject.getBounds !== "function") {
        return null;
      }

      try {
        return displayObject.getBounds();
      } catch (error) {
        return null;
      }
    }

    function getScaleMetrics(game) {
      var scale = game && game.scale ? game.scale : {};
      var canvas = game && game.canvas ? game.canvas : {};

      return {
        width: toNumber(scale.width) || toNumber(scale.gameSize && scale.gameSize.width) || toNumber(canvas.width),
        height:
          toNumber(scale.height) || toNumber(scale.gameSize && scale.gameSize.height) || toNumber(canvas.height)
      };
    }

    function getObjectScreenBounds(game, displayObject) {
      var bounds = getObjectBounds(displayObject);
      var canvas = game && game.canvas;

      if (!bounds || !canvas || typeof canvas.getBoundingClientRect !== "function") {
        return null;
      }

      var rect = canvas.getBoundingClientRect();
      var metrics = getScaleMetrics(game);

      if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
        return null;
      }

      var scaleX = rect.width / metrics.width;
      var scaleY = rect.height / metrics.height;

      return {
        left: rect.left + bounds.x * scaleX,
        top: rect.top + bounds.y * scaleY,
        width: bounds.width * scaleX,
        height: bounds.height * scaleY
      };
    }

    function getPointScreenPosition(game, x, y) {
      var canvas = game && game.canvas;

      if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
        return null;
      }

      var rect = canvas.getBoundingClientRect();
      var metrics = getScaleMetrics(game);

      if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
        return null;
      }

      return {
        left: rect.left + x * (rect.width / metrics.width),
        top: rect.top + y * (rect.height / metrics.height)
      };
    }

    function getCameraScreenBounds(game, camera) {
      var canvas = game && game.canvas;

      if (!canvas || !camera || typeof canvas.getBoundingClientRect !== "function") {
        return null;
      }

      var rect = canvas.getBoundingClientRect();
      var metrics = getScaleMetrics(game);

      if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
        return null;
      }

      var scaleX = rect.width / metrics.width;
      var scaleY = rect.height / metrics.height;

      return {
        left: rect.left + (toNumber(camera.x) || 0) * scaleX,
        top: rect.top + (toNumber(camera.y) || 0) * scaleY,
        width: (toNumber(camera.width) || 0) * scaleX,
        height: (toNumber(camera.height) || 0) * scaleY
      };
    }

    function getWorldViewScreenBounds(game, camera) {
      var worldView = camera && camera.worldView ? camera.worldView : null;

      if (!worldView) {
        return null;
      }

      var topLeft = getPointScreenPosition(game, toNumber(worldView.x) || 0, toNumber(worldView.y) || 0);
      var metrics = getScaleMetrics(game);
      var canvas = game && game.canvas;

      if (!topLeft || !canvas || typeof canvas.getBoundingClientRect !== "function") {
        return null;
      }

      var rect = canvas.getBoundingClientRect();

      if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
        return null;
      }

      return {
        left: topLeft.left,
        top: topLeft.top,
        width: (toNumber(worldView.width) || 0) * (rect.width / metrics.width),
        height: (toNumber(worldView.height) || 0) * (rect.height / metrics.height)
      };
    }

    function getObjectOriginScreenPosition(game, displayObject) {
      var bounds = getObjectBounds(displayObject);

      if (!bounds || !displayObject) {
        return null;
      }

      var originX = toNumber(displayObject.originX);
      var originY = toNumber(displayObject.originY);
      var pointX = bounds.x + bounds.width * (originX === null ? 0.5 : originX);
      var pointY = bounds.y + bounds.height * (originY === null ? 0.5 : originY);

      return getPointScreenPosition(game, pointX, pointY);
    }

    function getSceneCameras(scene) {
      if (!scene || !scene.cameras) {
        return [];
      }

      if (Array.isArray(scene.cameras.cameras)) {
        return scene.cameras.cameras.filter(function (camera) {
          return !!camera && camera.visible !== false;
        });
      }

      if (scene.cameras.main) {
        return [scene.cameras.main];
      }

      return [];
    }

    function cameraContainsPoint(camera, x, y) {
      if (!camera) {
        return true;
      }

      var cameraX = toNumber(camera.x) || 0;
      var cameraY = toNumber(camera.y) || 0;
      var cameraWidth = toNumber(camera.width);
      var cameraHeight = toNumber(camera.height);

      if (!cameraWidth || !cameraHeight) {
        return true;
      }

      return x >= cameraX && x <= cameraX + cameraWidth && y >= cameraY && y <= cameraY + cameraHeight;
    }

    function canRenderToCamera(displayObject, camera) {
      if (!displayObject || !camera) {
        return true;
      }

      if (typeof displayObject.willRender === "function") {
        try {
          return !!displayObject.willRender(camera);
        } catch (error) {
          // Ignore runtime-specific render checks and fall back below.
        }
      }

      if (typeof displayObject.cameraFilter === "number" && typeof camera.id === "number") {
        return (displayObject.cameraFilter & camera.id) === 0;
      }

      return true;
    }

    function getWorldPointForCamera(camera, x, y) {
      if (!camera) {
        return { x: x, y: y };
      }

      if (typeof camera.getWorldPoint === "function") {
        try {
          var worldPoint = camera.getWorldPoint(x, y);

          if (worldPoint && isFiniteNumber(worldPoint.x) && isFiniteNumber(worldPoint.y)) {
            return {
              x: worldPoint.x,
              y: worldPoint.y
            };
          }
        } catch (error) {
          // Ignore and fall back to a simple camera transform.
        }
      }

      var cameraX = toNumber(camera.x) || 0;
      var cameraY = toNumber(camera.y) || 0;
      var scrollX = toNumber(camera.scrollX) || 0;
      var scrollY = toNumber(camera.scrollY) || 0;
      var zoomX = toNumber(camera.zoomX) || toNumber(camera.zoom) || 1;
      var zoomY = toNumber(camera.zoomY) || toNumber(camera.zoom) || 1;

      return {
        x: scrollX + (x - cameraX) / zoomX,
        y: scrollY + (y - cameraY) / zoomY
      };
    }

    function getHitTestPointsForScene(scene, pointX, pointY) {
      var cameras = getSceneCameras(scene);
      var points = [];

      if (cameras.length === 0) {
        return [{ camera: null, x: pointX, y: pointY }];
      }

      for (var index = cameras.length - 1; index >= 0; index -= 1) {
        var camera = cameras[index];

        if (!cameraContainsPoint(camera, pointX, pointY)) {
          continue;
        }

        var worldPoint = getWorldPointForCamera(camera, pointX, pointY);
        points.push({
          camera: camera,
          x: worldPoint.x,
          y: worldPoint.y
        });
      }

      if (points.length === 0) {
        points.push({ camera: null, x: pointX, y: pointY });
      }

      return points;
    }

    function objectContainsPoint(displayObject, hitTestPoints) {
      var bounds = getObjectBounds(displayObject);

      if (!bounds) {
        return false;
      }

      for (var index = 0; index < hitTestPoints.length; index += 1) {
        var hitTestPoint = hitTestPoints[index];

        if (!canRenderToCamera(displayObject, hitTestPoint.camera)) {
          continue;
        }

        if (pointInBounds(bounds, hitTestPoint.x, hitTestPoint.y)) {
          return true;
        }
      }

      return false;
    }

    function ensureOverlayInfrastructure() {
      var registry = getRegistry();

      if (!registry.__debugOverlayContainer || !registry.__debugOverlayContainer.isConnected) {
        var container = document.createElement("div");

        container.style.position = "fixed";
        container.style.left = "0";
        container.style.top = "0";
        container.style.width = "0";
        container.style.height = "0";
        container.style.pointerEvents = "none";
        container.style.zIndex = "2147483647";

        document.documentElement.appendChild(container);
        registry.__debugOverlayContainer = container;
      }

      if (!registry.__overlayElement || !registry.__overlayElement.isConnected) {
        var overlay = document.createElement("div");

        overlay.style.position = "fixed";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.width = "0";
        overlay.style.height = "0";
        overlay.style.border = "2px solid #00d0ff";
        overlay.style.boxShadow = "0 0 0 9999px rgba(0, 208, 255, 0.08)";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "2147483647";
        overlay.style.display = "none";
        overlay.style.borderRadius = "4px";

        document.documentElement.appendChild(overlay);
        registry.__overlayElement = overlay;
      }

      function makeOverlayElement(className, borderColor, fillColor) {
        var element = document.createElement("div");

        element.className = className;
        element.style.position = "fixed";
        element.style.left = "0";
        element.style.top = "0";
        element.style.width = "0";
        element.style.height = "0";
        element.style.border = "1px solid " + borderColor;
        element.style.background = fillColor || "transparent";
        element.style.pointerEvents = "none";
        element.style.display = "none";
        element.style.borderRadius = "2px";

        registry.__debugOverlayContainer.appendChild(element);
        return element;
      }

      function ensureOverlayPool() {
        if (!registry.__debugOverlayPool) {
          registry.__debugOverlayPool = [];
        }

        return registry.__debugOverlayPool;
      }

      function hideOverlayPool(pool, startIndex) {
        for (var index = startIndex; index < pool.length; index += 1) {
          pool[index].style.display = "none";
        }
      }

      function drawBox(pool, index, bounds, className, borderColor, fillColor) {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
          return index;
        }

        if (!pool[index]) {
          pool[index] = makeOverlayElement(className, borderColor, fillColor);
        }

        var element = pool[index];
        element.className = className;
        element.style.borderColor = borderColor;
        element.style.background = fillColor || "transparent";
        element.style.display = "block";
        element.style.left = bounds.left + "px";
        element.style.top = bounds.top + "px";
        element.style.width = bounds.width + "px";
        element.style.height = bounds.height + "px";
        return index + 1;
      }

      function drawOrigin(pool, index, point) {
        if (!point) {
          return index;
        }

        if (!pool[index]) {
          pool[index] = makeOverlayElement("phaser-devtools-origin", "#ffcc00", "rgba(255, 204, 0, 0.22)");
        }

        var element = pool[index];
        element.className = "phaser-devtools-origin";
        element.style.borderColor = "#ffcc00";
        element.style.background = "rgba(255, 204, 0, 0.32)";
        element.style.borderRadius = "999px";
        element.style.display = "block";
        element.style.left = point.left - 3 + "px";
        element.style.top = point.top - 3 + "px";
        element.style.width = "6px";
        element.style.height = "6px";
        return index + 1;
      }

      function drawDebugOverlays(game, scene, selectedObject) {
        var options = registry.uiState.overlays || {};
        var pool = ensureOverlayPool();
        var index = 0;

        if (!game || !scene) {
          hideOverlayPool(pool, 0);
          return;
        }

        if (options.selectedBounds && selectedObject) {
          index = drawBox(
            pool,
            index,
            getObjectScreenBounds(game, selectedObject),
            "phaser-devtools-selected-bounds",
            "#00d0ff",
            "rgba(0, 208, 255, 0.06)"
          );
        }

        if (options.allBounds || options.origins) {
          var summaries = [];

          flattenSceneObjects(
            scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : null,
            getDisplayList(scene),
            0,
            [],
            summaries
          );

          summaries.slice(0, 250).forEach(function (summary) {
            var displayObject = getDisplayObjectByPath(scene, summary.path);

            if (!displayObject || displayObject.visible === false) {
              return;
            }

            if (options.allBounds) {
              index = drawBox(
                pool,
                index,
                getObjectScreenBounds(game, displayObject),
                "phaser-devtools-object-bounds",
                "rgba(124, 179, 255, 0.8)",
                "rgba(124, 179, 255, 0.035)"
              );
            }

            if (options.origins) {
              index = drawOrigin(pool, index, getObjectOriginScreenPosition(game, displayObject));
            }
          });
        }

        if (options.cameraViewport || options.cameraWorldView) {
          var camera = scene && scene.cameras ? scene.cameras.main : null;

          if (options.cameraViewport) {
            index = drawBox(
              pool,
              index,
              getCameraScreenBounds(game, camera),
              "phaser-devtools-camera-viewport",
              "#a855f7",
              "rgba(168, 85, 247, 0.06)"
            );
          }

          if (options.cameraWorldView) {
            index = drawBox(
              pool,
              index,
              getWorldViewScreenBounds(game, camera),
              "phaser-devtools-camera-world",
              "#f97316",
              "rgba(249, 115, 22, 0.06)"
            );
          }
        }

        hideOverlayPool(pool, index);
      }

      if (!registry.__overlayLoopStarted) {
        registry.__overlayLoopStarted = true;

        function updateOverlay() {
          var overlay = registry.__overlayElement;
          var highlight = registry.uiState.highlight;
          var options = registry.uiState.overlays || {};
          var overlaySceneKey = options.sceneKey || (highlight && highlight.sceneKey);
          var overlayObjectPath = options.objectPath || (highlight && highlight.objectPath);

          if (!overlay || (!highlight && !overlaySceneKey)) {
            if (overlay) {
              overlay.style.display = "none";
            }

            drawDebugOverlays(null, null, null);
            window.requestAnimationFrame(updateOverlay);
            return;
          }

          var game = findGame();
          var scene = game ? getSceneByKey(game, overlaySceneKey) : null;
          var displayObject = scene && overlayObjectPath ? getDisplayObjectByPath(scene, overlayObjectPath) : null;
          var screenBounds = game && displayObject ? getObjectScreenBounds(game, displayObject) : null;

          if (
            options.selectedBounds === false ||
            !screenBounds ||
            screenBounds.width <= 0 ||
            screenBounds.height <= 0
          ) {
            overlay.style.display = "none";
          } else if (highlight && highlight.isChanged) {
            overlay.style.borderColor = "#22c55e";
            overlay.style.boxShadow = "0 0 0 9999px rgba(34, 197, 94, 0.1)";
            overlay.style.display = "block";
            overlay.style.left = screenBounds.left + "px";
            overlay.style.top = screenBounds.top + "px";
            overlay.style.width = screenBounds.width + "px";
            overlay.style.height = screenBounds.height + "px";
          } else {
            overlay.style.borderColor = "#00d0ff";
            overlay.style.boxShadow = "0 0 0 9999px rgba(0, 208, 255, 0.08)";
            overlay.style.display = "block";
            overlay.style.left = screenBounds.left + "px";
            overlay.style.top = screenBounds.top + "px";
            overlay.style.width = screenBounds.width + "px";
            overlay.style.height = screenBounds.height + "px";
          }

          drawDebugOverlays(game, scene, displayObject);

          window.requestAnimationFrame(updateOverlay);
        }

        window.requestAnimationFrame(updateOverlay);
      }
    }

    function findTopmostObjectInList(objects, hitTestPoints, parentPathSegments) {
      for (var index = objects.length - 1; index >= 0; index -= 1) {
        var displayObject = objects[index];
        var pathSegments = parentPathSegments.concat(index);
        var children = getObjectChildren(displayObject);
        var childMatch = findTopmostObjectInList(children, hitTestPoints, pathSegments);

        if (childMatch) {
          return childMatch;
        }

        if (!displayObject || displayObject.visible === false || displayObject.alpha === 0) {
          continue;
        }

        if (objectContainsPoint(displayObject, hitTestPoints)) {
          return {
            sceneKey: null,
            objectPath: pathToString(pathSegments)
          };
        }
      }

      return null;
    }

    function findTopmostObjectAtPoint(game, preferredSceneKey, pointX, pointY) {
      var scenes = getScenes(game).slice();

      if (preferredSceneKey) {
        scenes = scenes.filter(function (scene) {
          return scene && scene.sys && scene.sys.settings && scene.sys.settings.key === preferredSceneKey;
        });
      } else {
        scenes = scenes.filter(function (scene) {
          return getSceneActive(scene) !== false && getSceneVisibility(scene) !== false;
        });
      }

      for (var sceneIndex = scenes.length - 1; sceneIndex >= 0; sceneIndex -= 1) {
        var scene = scenes[sceneIndex];
        var hitTestPoints = getHitTestPointsForScene(scene, pointX, pointY);
        var match = findTopmostObjectInList(getDisplayList(scene), hitTestPoints, []);

        if (match) {
          match.sceneKey = scene.sys && scene.sys.settings ? scene.sys.settings.key : null;
          return match;
        }
      }

      return null;
    }

    function attachCanvasPicker(game) {
      var registry = getRegistry();
      var canvas = game && game.canvas;

      if (!canvas || canvas.__PHASER_DEVTOOLS_PICKER__) {
        return;
      }

      canvas.__PHASER_DEVTOOLS_PICKER__ = true;
      canvas.addEventListener(
        "pointerdown",
        function (event) {
          if (event.button !== undefined && event.button !== 0) {
            return;
          }

          var pickMode = registry.uiState.pickMode;

          if (!pickMode || !pickMode.enabled) {
            return;
          }

          var rect = canvas.getBoundingClientRect();
          var metrics = getScaleMetrics(game);

          if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
            return;
          }

          var pointX = ((event.clientX - rect.left) / rect.width) * metrics.width;
          var pointY = ((event.clientY - rect.top) / rect.height) * metrics.height;
          var match = findTopmostObjectAtPoint(game, pickMode.sceneKey, pointX, pointY);

          event.preventDefault();
          event.stopPropagation();

          if (!match || !match.sceneKey || !match.objectPath) {
            return;
          }

          registry.uiState.pendingSelection = {
            sceneKey: match.sceneKey,
            objectPath: match.objectPath
          };
          registry.uiState.pickMode = { enabled: false, sceneKey: null };
          registry.uiState.highlight = {
            sceneKey: match.sceneKey,
            objectPath: match.objectPath
          };
        },
        true
      );
    }

    function ensureInteractiveTools() {
      ensureOverlayInfrastructure();

      var registry = getRegistry();

      registry.games.forEach(function (game) {
        attachCanvasPicker(game);
      });

      var detectedGame = findGame();

      if (detectedGame) {
        attachCanvasPicker(detectedGame);
        getScenes(detectedGame).forEach(function (scene) {
          var loader = scene && scene.load ? scene.load : null;

          [
            "list",
            "queue",
            "pendingFiles",
            "_pending",
            "inflight",
            "inflightQueue",
            "_inflight",
            "failed",
            "failedFiles",
            "_failed"
          ].forEach(function (name) {
            try {
              collectLoaderFilesFromCollection(loader && loader[name], [], {});
            } catch (error) {
              // Best-effort URL backfill only.
            }
          });
        });

        if (registry.games.indexOf(detectedGame) === -1) {
          registry.games.push(detectedGame);
        }
      }
    }

    function getGameSnapshot() {
      ensureInteractiveTools();

      var game = findGame();

      if (!game) {
        return {
          detected: false,
          game: null,
          scenes: [],
          pickModeEnabled: false
        };
      }

      var scenes = getScenes(game);
      var metrics = getScaleMetrics(game);
      var registry = getRegistry();

      return {
        detected: true,
        game: {
          width: metrics.width,
          height: metrics.height,
          rendererType: getRendererType(game),
          sceneCount: scenes.length,
          fps: serializeFps(game)
        },
        scenes: scenes.map(serializeScene),
        pickModeEnabled: !!registry.uiState.pickMode.enabled
      };
    }

    function getSceneInspector(sceneKey) {
      ensureInteractiveTools();

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;

      if (scene && scene.load) {
        attachLoaderUrlTracker(scene.load);
      }

      return {
        sceneKey: sceneKey,
        state: scene ? serializeScene(scene) : null,
        load: scene ? serializeLoad(scene) : null,
        camera: scene ? serializeCamera(scene.cameras && scene.cameras.main, scene) : null,
        physics: scene ? serializePhysics(scene, null) : null,
        fps: game ? serializeFps(game) : null
      };
    }

    function getSceneObjects(sceneKey) {
      ensureInteractiveTools();

      var game = findGame();

      if (!game) {
        return {
          sceneKey: sceneKey,
          objects: []
        };
      }

      var scene = getSceneByKey(game, sceneKey);
      var objects = [];

      flattenSceneObjects(sceneKey, getDisplayList(scene), 0, [], objects);

      return {
        sceneKey: sceneKey,
        objects: objects
      };
    }

    function getTextureCache() {
      ensureInteractiveTools();

      var game = findGame();
      var textureManager = game && game.textures ? game.textures : null;
      var keys = getTextureKeys(textureManager);

      return {
        textures: keys.map(function (textureKey) {
          return serializeTextureSummary(game, textureKey);
        })
      };
    }

    function getTextureDetails(textureKey) {
      ensureInteractiveTools();

      var game = findGame();

      if (!game || !game.textures || !textureKey) {
        return {
          texture: null
        };
      }

      return {
        texture: serializeTextureDetails(game, textureKey)
      };
    }

    function getObjectDetails(sceneKey, objectPath) {
      ensureInteractiveTools();

      var game = findGame();

      if (!game) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: null
        };
      }

      var scene = getSceneByKey(game, sceneKey);
      var displayObject = scene ? getDisplayObjectByPath(scene, objectPath) : null;

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath)
      };
    }

    function setObjectVisibility(sceneKey, objectPath, visible) {
      ensureInteractiveTools();

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;
      var displayObject = scene ? getDisplayObjectByPath(scene, objectPath) : null;

      if (!displayObject) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: null
        };
      }

      if (typeof displayObject.setVisible === "function") {
        captureObjectEditBaseline(sceneKey, objectPath, displayObject);
        displayObject.setVisible(!!visible);
      } else {
        captureObjectEditBaseline(sceneKey, objectPath, displayObject);
        displayObject.visible = !!visible;
      }

      reconcileObjectEditBaseline(sceneKey, objectPath, displayObject);

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath)
      };
    }

    function updateObjectProperty(sceneKey, objectPath, property, value) {
      ensureInteractiveTools();

      var editableProperties = {
        x: "number",
        y: "number",
        scaleX: "number",
        scaleY: "number",
        alpha: "number",
        rotation: "number",
        visible: "boolean"
      };

      if (!editableProperties[property]) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: null,
          error: "Property is not editable"
        };
      }

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;
      var displayObject = scene ? getDisplayObjectByPath(scene, objectPath) : null;

      if (!displayObject) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: null,
          error: "Display object not found"
        };
      }

      if (editableProperties[property] === "boolean") {
        captureObjectEditBaseline(sceneKey, objectPath, displayObject);
        if (property === "visible" && typeof displayObject.setVisible === "function") {
          displayObject.setVisible(!!value);
        } else {
          displayObject[property] = !!value;
        }
      } else {
        var parsedValue = Number(value);

        if (!Number.isFinite(parsedValue)) {
          return {
            sceneKey: sceneKey,
            objectPath: objectPath,
            object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath),
            error: "Value must be a finite number"
          };
        }

        captureObjectEditBaseline(sceneKey, objectPath, displayObject);
        displayObject[property] = parsedValue;
      }

      reconcileObjectEditBaseline(sceneKey, objectPath, displayObject);

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath)
      };
    }

    function resetObjectEdits(sceneKey, objectPath) {
      ensureInteractiveTools();

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;
      var displayObject = scene ? getDisplayObjectByPath(scene, objectPath) : null;
      var baseline = getObjectEditBaseline(sceneKey, objectPath);

      if (!displayObject) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: null,
          error: "Display object not found"
        };
      }

      if (!baseline) {
        return {
          sceneKey: sceneKey,
          objectPath: objectPath,
          object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath),
          error: "No saved edits to reset"
        };
      }

      applyEditableObjectSnapshot(displayObject, baseline);
      clearObjectEditBaseline(sceneKey, objectPath);

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(sceneKey, displayObject, objectPath)
      };
    }

    function resetAllObjectEdits(sceneKey) {
      ensureInteractiveTools();

      var registry = getRegistry();
      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;

      if (!scene) {
        return {
          sceneKey: sceneKey,
          resetCount: 0,
          error: "Scene not found"
        };
      }

      var prefix = String(sceneKey || "") + "::";
      var resetCount = 0;

      Object.keys(registry.uiState.objectEditBaselines).forEach(function (baselineKey) {
        if (baselineKey.indexOf(prefix) !== 0) {
          return;
        }

        var objectPath = baselineKey.slice(prefix.length);
        var displayObject = getDisplayObjectByPath(scene, objectPath);
        var baseline = registry.uiState.objectEditBaselines[baselineKey];

        if (displayObject && baseline) {
          applyEditableObjectSnapshot(displayObject, baseline);
          resetCount += 1;
        }

        delete registry.uiState.objectEditBaselines[baselineKey];
      });

      return {
        sceneKey: sceneKey,
        resetCount: resetCount
      };
    }

    function updateSceneCameraProperty(sceneKey, property, value) {
      ensureInteractiveTools();

      var editableProperties = {
        x: "number",
        y: "number",
        width: "number",
        height: "number",
        scrollX: "number",
        scrollY: "number",
        zoom: "number",
        rotation: "number",
        roundPixels: "boolean",
        visible: "boolean",
        backgroundColor: "string"
      };

      if (!editableProperties[property]) {
        return {
          sceneKey: sceneKey,
          property: property,
          camera: null,
          error: "Camera property is not editable"
        };
      }

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;
      var camera = scene && scene.cameras ? scene.cameras.main : null;

      if (!camera) {
        return {
          sceneKey: sceneKey,
          property: property,
          camera: null,
          error: "Main camera not found"
        };
      }

      var parsedValue = value;

      if (editableProperties[property] === "number") {
        parsedValue = Number(value);

        if (!Number.isFinite(parsedValue)) {
          return {
            sceneKey: sceneKey,
            property: property,
            camera: serializeCamera(camera, scene),
            error: "Value must be a finite number"
          };
        }
      }

      if (property === "x" || property === "y") {
        if (typeof camera.setPosition === "function") {
          camera.setPosition(
            property === "x" ? parsedValue : toNumber(camera.x) || 0,
            property === "y" ? parsedValue : toNumber(camera.y) || 0
          );
        } else {
          camera[property] = parsedValue;
        }
      } else if (property === "width" || property === "height") {
        if (typeof camera.setSize === "function") {
          camera.setSize(
            property === "width" ? parsedValue : toNumber(camera.width) || 0,
            property === "height" ? parsedValue : toNumber(camera.height) || 0
          );
        } else {
          camera[property] = parsedValue;
        }
      } else if (property === "scrollX" || property === "scrollY") {
        if (typeof camera.setScroll === "function") {
          camera.setScroll(
            property === "scrollX" ? parsedValue : toNumber(camera.scrollX) || 0,
            property === "scrollY" ? parsedValue : toNumber(camera.scrollY) || 0
          );
        } else {
          camera[property] = parsedValue;
        }
      } else if (property === "zoom") {
        if (typeof camera.setZoom === "function") {
          camera.setZoom(parsedValue);
        } else {
          camera.zoom = parsedValue;
        }
      } else if (property === "rotation") {
        if (typeof camera.setRotation === "function") {
          camera.setRotation(parsedValue);
        } else {
          camera.rotation = parsedValue;
        }
      } else if (property === "visible") {
        camera.visible = !!value;
      } else if (property === "roundPixels") {
        camera.roundPixels = !!value;
      } else if (property === "backgroundColor") {
        if (typeof value !== "string" || value.length === 0) {
          return {
            sceneKey: sceneKey,
            property: property,
            camera: serializeCamera(camera, scene),
            error: "Background color must be a string"
          };
        }

        if (typeof camera.setBackgroundColor === "function") {
          camera.setBackgroundColor(value);
        } else {
          camera.backgroundColor = value;
        }
      }

      return {
        sceneKey: sceneKey,
        property: property,
        camera: serializeCamera(camera, scene)
      };
    }

    function performCameraAction(sceneKey, action) {
      ensureInteractiveTools();

      var supportedActions = {
        fadeIn: true,
        fadeOut: true,
        flash: true,
        resetFX: true,
        shake: true,
        destroy: true
      };

      if (!supportedActions[action]) {
        return {
          sceneKey: sceneKey,
          ok: false,
          error: "Unsupported camera action"
        };
      }

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;
      var cameraManager = scene ? scene.cameras : null;
      var camera = cameraManager ? cameraManager.main : null;

      if (!scene || !camera) {
        return {
          sceneKey: sceneKey,
          ok: false,
          error: "Main camera not found"
        };
      }

      if (action === "fadeIn") {
        if (typeof camera.fadeIn !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Fade in is not available on this camera"
          };
        }

        camera.fadeIn(1000, 0, 0, 0);
      } else if (action === "fadeOut") {
        if (typeof camera.fadeOut !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Fade out is not available on this camera"
          };
        }

        camera.fadeOut(1000, 0, 0, 0);
      } else if (action === "flash") {
        if (typeof camera.flash !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Flash is not available on this camera"
          };
        }

        camera.flash(250, 255, 255, 255, true);
      } else if (action === "resetFX") {
        if (typeof camera.resetFX !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Reset FX is not available on this camera"
          };
        }

        camera.resetFX();
      } else if (action === "shake") {
        if (typeof camera.shake !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Shake is not available on this camera"
          };
        }

        camera.shake(100, 0.05, true);
      } else if (action === "destroy") {
        if (!cameraManager || typeof cameraManager.remove !== "function") {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Camera manager cannot remove this camera"
          };
        }

        if (getSceneCameraCount(scene) <= 1) {
          return {
            sceneKey: sceneKey,
            ok: false,
            error: "Cannot destroy the only camera in a scene"
          };
        }

        cameraManager.remove(camera, true);
        camera = cameraManager.main || null;
      }

      return {
        sceneKey: sceneKey,
        ok: true,
        action: action,
        camera: camera ? serializeCamera(camera, scene) : null,
        snapshot: getGameSnapshot()
      };
    }

    function trySceneAction(game, scene, action) {
      var sceneManager = game && game.scene ? game.scene : null;
      var scenePlugin = scene && scene.scene ? scene.scene : null;
      var sceneKey = scene && scene.sys && scene.sys.settings ? scene.sys.settings.key : null;

      if (action === "restart") {
        if (scenePlugin && typeof scenePlugin.restart === "function") {
          scenePlugin.restart();
          return true;
        }

        if (sceneManager && typeof sceneManager.restart === "function") {
          sceneManager.restart(sceneKey);
          return true;
        }
      }

      if (sceneManager && typeof sceneManager[action] === "function") {
        sceneManager[action](sceneKey);
        return true;
      }

      if (scenePlugin && typeof scenePlugin[action] === "function") {
        scenePlugin[action]();
        return true;
      }

      return false;
    }

    function performSceneAction(sceneKey, action) {
      ensureInteractiveTools();

      var supportedActions = {
        pause: true,
        resume: true,
        sleep: true,
        wake: true,
        stop: true,
        restart: true,
        remove: true
      };

      if (!supportedActions[action]) {
        return {
          sceneKey: sceneKey,
          ok: false,
          error: "Unsupported scene action"
        };
      }

      var game = findGame();
      var scene = game ? getSceneByKey(game, sceneKey) : null;

      if (!game || !scene) {
        return {
          sceneKey: sceneKey,
          ok: false,
          error: "Scene not found"
        };
      }

      if (!trySceneAction(game, scene, action)) {
        return {
          sceneKey: sceneKey,
          ok: false,
          error: "Scene action is not available"
        };
      }

      var snapshot = getGameSnapshot();
      var removed = !getSceneByKey(game, sceneKey);

      return {
        sceneKey: sceneKey,
        ok: true,
        removed: removed,
        snapshot: snapshot
      };
    }

    function highlightObject(sceneKey, objectPath, isChanged) {
      ensureInteractiveTools();

      var registry = getRegistry();

      registry.uiState.highlight = {
        sceneKey: sceneKey,
        objectPath: objectPath,
        isChanged: !!isChanged
      };

      registry.uiState.overlays.sceneKey = sceneKey;
      registry.uiState.overlays.objectPath = objectPath;

      return {
        highlighted: true
      };
    }

    function clearHighlight() {
      var registry = getRegistry();

      registry.uiState.highlight = null;

      return {
        highlighted: false
      };
    }

    function getDebugOverlayOptions() {
      var registry = getRegistry();
      var overlays = registry.uiState.overlays || {};

      return {
        selectedBounds: overlays.selectedBounds !== false,
        allBounds: overlays.allBounds === true,
        origins: overlays.origins === true,
        cameraViewport: overlays.cameraViewport === true,
        cameraWorldView: overlays.cameraWorldView === true,
        sceneKey: overlays.sceneKey || null,
        objectPath: overlays.objectPath || null
      };
    }

    function setDebugOverlayOptions(options) {
      ensureInteractiveTools();

      var registry = getRegistry();
      var current = getDebugOverlayOptions();
      var next = {};

      ["selectedBounds", "allBounds", "origins", "cameraViewport", "cameraWorldView"].forEach(function (key) {
        next[key] = options && options[key] !== undefined ? !!options[key] : !!current[key];
      });

      next.sceneKey = options && options.sceneKey !== undefined ? options.sceneKey : current.sceneKey;
      next.objectPath = options && options.objectPath !== undefined ? options.objectPath : current.objectPath;

      registry.uiState.overlays = next;
      return getDebugOverlayOptions();
    }

    function canOwnConsoleGlobal(name) {
      var registry = getRegistry();

      if (!registry.__consoleOwnedGlobals) {
        registry.__consoleOwnedGlobals = {};
      }

      return window[name] === undefined || registry.__consoleOwnedGlobals[name] === true;
    }

    function defineConsoleGlobal(name, getValue) {
      if (!canOwnConsoleGlobal(name)) {
        return false;
      }

      try {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: false,
          get: function () {
            return getValue();
          }
        });

        getRegistry().__consoleOwnedGlobals[name] = true;

        return true;
      } catch (error) {
        return false;
      }
    }

    function installConsoleNamespace() {
      var registry = getRegistry();

      if (window.$phaserDevTools && registry.__consoleOwnedGlobals && registry.__consoleOwnedGlobals.$phaserDevTools) {
        return true;
      }

      if (window.$phaserDevTools !== undefined && !(registry.__consoleOwnedGlobals && registry.__consoleOwnedGlobals.$phaserDevTools)) {
        return false;
      }

      var namespace = {
        __PHASER_DEVTOOLS_OWNED__: true,
        getGame: function () {
          return findGame();
        },
        getScene: function (key) {
          var game = findGame();
          var sceneKey = key || registry.uiState.console.sceneKey;
          return game && sceneKey ? getSceneByKey(game, sceneKey) : null;
        },
        getSelectedObject: function () {
          var game = findGame();
          var scene = game && registry.uiState.console.sceneKey
            ? getSceneByKey(game, registry.uiState.console.sceneKey)
            : null;

          return scene && registry.uiState.console.objectPath
            ? getDisplayObjectByPath(scene, registry.uiState.console.objectPath)
            : null;
        },
        getSelectedCamera: function () {
          var scene = namespace.getScene();
          return scene && scene.cameras ? scene.cameras.main : null;
        },
        inspectSelected: function () {
          var selected = namespace.getSelectedObject();

          if (selected && typeof inspect === "function") {
            inspect(selected);
          }

          return selected;
        }
      };

      try {
        Object.defineProperty(window, "$phaserDevTools", {
          configurable: true,
          enumerable: false,
          value: namespace
        });
        if (!registry.__consoleOwnedGlobals) {
          registry.__consoleOwnedGlobals = {};
        }
        registry.__consoleOwnedGlobals.$phaserDevTools = true;
        return true;
      } catch (error) {
        // If the safe namespace is unavailable, short globals are still attempted below.
      }

      return false;
    }

    function exportConsoleHelpers(sceneKey, objectPath) {
      ensureInteractiveTools();

      var registry = getRegistry();

      registry.uiState.console = {
        enabled: true,
        sceneKey: sceneKey || null,
        objectPath: objectPath || null
      };

      var exported = installConsoleNamespace() ? ["$phaserDevTools"] : [];

      if (defineConsoleGlobal("$phaserGame", function () {
        return findGame();
      })) {
        exported.push("$phaserGame");
      }

      if (defineConsoleGlobal("$phaserScene", function () {
        var game = findGame();
        return game && registry.uiState.console.sceneKey
          ? getSceneByKey(game, registry.uiState.console.sceneKey)
          : null;
      })) {
        exported.push("$phaserScene");
      }

      if (defineConsoleGlobal("$phaserObject", function () {
        var game = findGame();
        var scene = game && registry.uiState.console.sceneKey
          ? getSceneByKey(game, registry.uiState.console.sceneKey)
          : null;
        return scene && registry.uiState.console.objectPath
          ? getDisplayObjectByPath(scene, registry.uiState.console.objectPath)
          : null;
      })) {
        exported.push("$phaserObject");
      }

      if (defineConsoleGlobal("$phaserCamera", function () {
        var game = findGame();
        var scene = game && registry.uiState.console.sceneKey
          ? getSceneByKey(game, registry.uiState.console.sceneKey)
          : null;
        return scene && scene.cameras ? scene.cameras.main : null;
      })) {
        exported.push("$phaserCamera");
      }

      if (window.console && typeof window.console.info === "function") {
        var exportedGame = findGame();
        var exportedScene = exportedGame && registry.uiState.console.sceneKey
          ? getSceneByKey(exportedGame, registry.uiState.console.sceneKey)
          : null;
        var exportedObject = exportedScene && registry.uiState.console.objectPath
          ? getDisplayObjectByPath(exportedScene, registry.uiState.console.objectPath)
          : null;

        window.console.info("[Phaser DevTools] Console helpers exported", {
          helpers: exported,
          game: exportedGame,
          scene: exportedScene,
          object: exportedObject,
          camera: exportedScene && exportedScene.cameras ? exportedScene.cameras.main : null
        });
      }

      return {
        exported: exported,
        sceneKey: sceneKey || null,
        objectPath: objectPath || null
      };
    }

    function setPickMode(sceneKey, enabled) {
      ensureInteractiveTools();

      var registry = getRegistry();

      registry.uiState.pickMode = {
        enabled: !!enabled,
        sceneKey: enabled ? sceneKey || null : null
      };

      if (!enabled) {
        registry.uiState.pendingSelection = null;
      }

      return {
        pickModeEnabled: registry.uiState.pickMode.enabled
      };
    }

    function consumePickedObject() {
      ensureInteractiveTools();

      var registry = getRegistry();
      var selection = registry.uiState.pendingSelection;

      registry.uiState.pendingSelection = null;

      return {
        selection: selection,
        pickModeEnabled: !!registry.uiState.pickMode.enabled
      };
    }

    try {
      if (command.type === "snapshot") {
        return { ok: true, data: getGameSnapshot() };
      }

      if (command.type === "sceneInspector") {
        return { ok: true, data: getSceneInspector(command.sceneKey) };
      }

      if (command.type === "sceneObjects") {
        return { ok: true, data: getSceneObjects(command.sceneKey) };
      }

      if (command.type === "textureCache") {
        return { ok: true, data: getTextureCache() };
      }

      if (command.type === "textureDetails") {
        return { ok: true, data: getTextureDetails(command.textureKey) };
      }

      if (command.type === "objectDetails") {
        return { ok: true, data: getObjectDetails(command.sceneKey, command.objectPath) };
      }

      if (command.type === "setVisibility") {
        return { ok: true, data: setObjectVisibility(command.sceneKey, command.objectPath, command.visible) };
      }

      if (command.type === "updateObjectProperty") {
        return {
          ok: true,
          data: updateObjectProperty(command.sceneKey, command.objectPath, command.property, command.value)
        };
      }

      if (command.type === "resetObjectEdits") {
        return {
          ok: true,
          data: resetObjectEdits(command.sceneKey, command.objectPath)
        };
      }

      if (command.type === "resetAllObjectEdits") {
        return {
          ok: true,
          data: resetAllObjectEdits(command.sceneKey)
        };
      }

      if (command.type === "updateSceneCameraProperty") {
        return {
          ok: true,
          data: updateSceneCameraProperty(command.sceneKey, command.property, command.value)
        };
      }

      if (command.type === "performSceneAction") {
        return {
          ok: true,
          data: performSceneAction(command.sceneKey, command.action)
        };
      }

      if (command.type === "performCameraAction") {
        return {
          ok: true,
          data: performCameraAction(command.sceneKey, command.action)
        };
      }

      if (command.type === "highlightObject") {
        return {
          ok: true,
          data: highlightObject(command.sceneKey, command.objectPath, command.isChanged)
        };
      }

      if (command.type === "clearHighlight") {
        return { ok: true, data: clearHighlight() };
      }

      if (command.type === "getDebugOverlayOptions") {
        return { ok: true, data: getDebugOverlayOptions() };
      }

      if (command.type === "setDebugOverlayOptions") {
        return { ok: true, data: setDebugOverlayOptions(command.options) };
      }

      if (command.type === "exportConsoleHelpers") {
        return { ok: true, data: exportConsoleHelpers(command.sceneKey, command.objectPath) };
      }

      if (command.type === "setPickMode") {
        return { ok: true, data: setPickMode(command.sceneKey, command.enabled) };
      }

      if (command.type === "consumePickedObject") {
        return { ok: true, data: consumePickedObject() };
      }

      return {
        ok: false,
        error: "Unknown bridge command"
      };
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : "Unknown inspected-page error"
      };
    }
  }

  function evaluateCommand(command) {
    return new Promise(function (resolve, reject) {
      var expression = "(" + inspectedPageExecutor.toString() + ")(" + JSON.stringify(command) + ")";

      chrome.devtools.inspectedWindow.eval(expression, function (result, exceptionInfo) {
        if (exceptionInfo && exceptionInfo.isException) {
          reject(new Error(exceptionInfo.value || "Failed to evaluate the inspected page"));
          return;
        }

        if (!result) {
          reject(new Error("No response received from the inspected page"));
          return;
        }

        if (!result.ok) {
          reject(new Error(result.error || "The inspected page returned an error"));
          return;
        }

        resolve(result.data);
      });
    });
  }

  window.PhaserBridge = {
    getGameSnapshot: function () {
      return evaluateCommand({ type: "snapshot" });
    },

    getSceneInspector: function (sceneKey) {
      return evaluateCommand({ type: "sceneInspector", sceneKey: sceneKey });
    },

    getSceneObjects: function (sceneKey) {
      return evaluateCommand({ type: "sceneObjects", sceneKey: sceneKey });
    },

    getTextureCache: function () {
      return evaluateCommand({ type: "textureCache" });
    },

    getTextureDetails: function (textureKey) {
      return evaluateCommand({ type: "textureDetails", textureKey: textureKey });
    },

    getObjectDetails: function (sceneKey, objectPath) {
      return evaluateCommand({ type: "objectDetails", sceneKey: sceneKey, objectPath: objectPath });
    },

    setObjectVisibility: function (sceneKey, objectPath, visible) {
      return evaluateCommand({
        type: "setVisibility",
        sceneKey: sceneKey,
        objectPath: objectPath,
        visible: visible
      });
    },

    updateObjectProperty: function (sceneKey, objectPath, property, value) {
      return evaluateCommand({
        type: "updateObjectProperty",
        sceneKey: sceneKey,
        objectPath: objectPath,
        property: property,
        value: value
      });
    },

    resetObjectEdits: function (sceneKey, objectPath) {
      return evaluateCommand({
        type: "resetObjectEdits",
        sceneKey: sceneKey,
        objectPath: objectPath
      });
    },

    resetAllObjectEdits: function (sceneKey) {
      return evaluateCommand({
        type: "resetAllObjectEdits",
        sceneKey: sceneKey
      });
    },

    updateSceneCameraProperty: function (sceneKey, property, value) {
      return evaluateCommand({
        type: "updateSceneCameraProperty",
        sceneKey: sceneKey,
        property: property,
        value: value
      });
    },

    performSceneAction: function (sceneKey, action) {
      return evaluateCommand({
        type: "performSceneAction",
        sceneKey: sceneKey,
        action: action
      });
    },

    performCameraAction: function (sceneKey, action) {
      return evaluateCommand({
        type: "performCameraAction",
        sceneKey: sceneKey,
        action: action
      });
    },

    highlightObject: function (sceneKey, objectPath, isChanged) {
      return evaluateCommand({
        type: "highlightObject",
        sceneKey: sceneKey,
        objectPath: objectPath,
        isChanged: !!isChanged
      });
    },

    clearHighlight: function () {
      return evaluateCommand({ type: "clearHighlight" });
    },

    getDebugOverlayOptions: function () {
      return evaluateCommand({ type: "getDebugOverlayOptions" });
    },

    setDebugOverlayOptions: function (options) {
      return evaluateCommand({
        type: "setDebugOverlayOptions",
        options: options
      });
    },

    exportConsoleHelpers: function (sceneKey, objectPath) {
      return evaluateCommand({
        type: "exportConsoleHelpers",
        sceneKey: sceneKey,
        objectPath: objectPath
      });
    },

    setPickMode: function (sceneKey, enabled) {
      return evaluateCommand({
        type: "setPickMode",
        sceneKey: sceneKey,
        enabled: enabled
      });
    },

    consumePickedObject: function () {
      return evaluateCommand({ type: "consumePickedObject" });
    }
  };
})();
