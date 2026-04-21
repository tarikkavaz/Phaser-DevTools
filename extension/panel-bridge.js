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
          pickMode: { enabled: false, sceneKey: null },
          pendingSelection: null
        };
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

    function serializeScene(scene) {
      var sceneSettings = scene && scene.sys ? scene.sys.settings : null;

      return {
        key: sceneSettings && sceneSettings.key ? sceneSettings.key : "(unnamed scene)",
        active: getSceneActive(scene),
        visible: getSceneVisibility(scene)
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

    function serializeDisplayObjectSummary(displayObject, pathSegments, depth) {
      var childCount = getObjectChildren(displayObject).length;

      return {
        path: pathToString(pathSegments),
        depth: depth,
        name: toStringValue(displayObject && displayObject.name),
        type: getObjectType(displayObject),
        x: toNumber(displayObject && displayObject.x),
        y: toNumber(displayObject && displayObject.y),
        visible: toBoolean(displayObject && displayObject.visible),
        childCount: childCount
      };
    }

    function serializeDisplayObjectDetails(displayObject, objectPath) {
      if (!displayObject) {
        return null;
      }

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
        childCount: getObjectChildren(displayObject).length
      };
    }

    function flattenSceneObjects(objects, depth, parentPathSegments, results) {
      for (var index = 0; index < objects.length; index += 1) {
        var displayObject = objects[index];
        var pathSegments = parentPathSegments.concat(index);

        results.push(serializeDisplayObjectSummary(displayObject, pathSegments, depth));
        flattenSceneObjects(getObjectChildren(displayObject), depth + 1, pathSegments, results);
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

      if (!registry.__overlayLoopStarted) {
        registry.__overlayLoopStarted = true;

        function updateOverlay() {
          var overlay = registry.__overlayElement;
          var highlight = registry.uiState.highlight;

          if (!overlay || !highlight) {
            if (overlay) {
              overlay.style.display = "none";
            }

            window.requestAnimationFrame(updateOverlay);
            return;
          }

          var game = findGame();
          var scene = game ? getSceneByKey(game, highlight.sceneKey) : null;
          var displayObject = scene ? getDisplayObjectByPath(scene, highlight.objectPath) : null;
          var screenBounds = game && displayObject ? getObjectScreenBounds(game, displayObject) : null;

          if (!screenBounds || screenBounds.width <= 0 || screenBounds.height <= 0) {
            overlay.style.display = "none";
            window.requestAnimationFrame(updateOverlay);
            return;
          }

          overlay.style.display = "block";
          overlay.style.left = screenBounds.left + "px";
          overlay.style.top = screenBounds.top + "px";
          overlay.style.width = screenBounds.width + "px";
          overlay.style.height = screenBounds.height + "px";

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
          sceneCount: scenes.length
        },
        scenes: scenes.map(serializeScene),
        pickModeEnabled: !!registry.uiState.pickMode.enabled
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

      flattenSceneObjects(getDisplayList(scene), 0, [], objects);

      return {
        sceneKey: sceneKey,
        objects: objects
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
        object: serializeDisplayObjectDetails(displayObject, objectPath)
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
        displayObject.setVisible(!!visible);
      } else {
        displayObject.visible = !!visible;
      }

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(displayObject, objectPath)
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
            object: serializeDisplayObjectDetails(displayObject, objectPath),
            error: "Value must be a finite number"
          };
        }

        displayObject[property] = parsedValue;
      }

      return {
        sceneKey: sceneKey,
        objectPath: objectPath,
        object: serializeDisplayObjectDetails(displayObject, objectPath)
      };
    }

    function highlightObject(sceneKey, objectPath) {
      ensureInteractiveTools();

      var registry = getRegistry();

      registry.uiState.highlight = {
        sceneKey: sceneKey,
        objectPath: objectPath
      };

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

      if (command.type === "sceneObjects") {
        return { ok: true, data: getSceneObjects(command.sceneKey) };
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

      if (command.type === "highlightObject") {
        return { ok: true, data: highlightObject(command.sceneKey, command.objectPath) };
      }

      if (command.type === "clearHighlight") {
        return { ok: true, data: clearHighlight() };
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

    getSceneObjects: function (sceneKey) {
      return evaluateCommand({ type: "sceneObjects", sceneKey: sceneKey });
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

    highlightObject: function (sceneKey, objectPath) {
      return evaluateCommand({
        type: "highlightObject",
        sceneKey: sceneKey,
        objectPath: objectPath
      });
    },

    clearHighlight: function () {
      return evaluateCommand({ type: "clearHighlight" });
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
