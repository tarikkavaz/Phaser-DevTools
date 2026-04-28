(function () {
  var AUTO_REFRESH_COOLDOWN_MS = 1200;
  var PICK_POLL_INTERVAL_MS = 500;
  var SCENE_TELEMETRY_POLL_INTERVAL_MS = 250;
  var FPS_HISTORY_LIMIT = 60;
  var INSPECTOR_TABS = ["displayObjects", "state", "load", "camera", "fps"];

  var state = {
    snapshot: null,
    sceneInspector: null,
    sceneObjects: [],
    objectDetails: null,
    selectedSceneKey: null,
    selectedObjectPath: null,
    outlinedSceneKey: null,
    outlinedObjectPath: null,
    expandedPaths: {},
    filterQuery: "",
    isRefreshing: false,
    refreshQueued: false,
    lastRefreshAt: 0,
    sceneRequestId: 0,
    inspectorRequestId: 0,
    sceneInspectorRequestId: 0,
    pickModeEnabled: false,
    gameInfoExpanded: false,
    activeInspectorTab: "displayObjects",
    pendingInspectorFocus: null,
    pendingCameraFocus: null,
    pendingObjectListScrollTop: null,
    fpsHistoryByScene: {}
  };

  var elements = {};

  function cacheElements() {
    elements.status = document.getElementById("status");
    elements.refreshButton = document.getElementById("refresh-button");
    elements.resetAllButton = document.getElementById("reset-all-button");
    elements.pickButton = document.getElementById("pick-button");
    elements.emptyState = document.getElementById("empty-state");
    elements.content = document.getElementById("content");
    elements.gameDetected = document.getElementById("game-detected");
    elements.gameWidth = document.getElementById("game-width");
    elements.gameHeight = document.getElementById("game-height");
    elements.gameRenderer = document.getElementById("game-renderer");
    elements.sceneCount = document.getElementById("scene-count");
    elements.gameInfoToggle = document.getElementById("game-info-toggle");
    elements.gameInfoCard = document.getElementById("game-info-card");
    elements.sceneList = document.getElementById("scene-list");
    elements.sceneInspectorTitle = document.getElementById("scene-inspector-title");
    elements.sceneInspectorStatus = document.getElementById("scene-inspector-status");
    elements.sceneInspectorHeader = document.getElementById("scene-inspector-header");
    elements.selectedSceneName = document.getElementById("selected-scene-name");
    elements.selectedScenePills = document.getElementById("selected-scene-pills");
    elements.selectedSceneMeta = document.getElementById("selected-scene-meta");
    elements.inspectorTabs = document.getElementById("inspector-tabs");
    elements.objectList = document.getElementById("object-list");
    elements.objectListTitle = document.getElementById("object-list-title");
    elements.objectFilter = document.getElementById("object-filter");
    elements.breadcrumbs = document.getElementById("breadcrumbs");
    elements.statePanelContent = document.getElementById("state-panel-content");
    elements.loadPanelContent = document.getElementById("load-panel-content");
    elements.cameraPanelContent = document.getElementById("camera-panel-content");
    elements.fpsPanelContent = document.getElementById("fps-panel-content");

    elements.tabButtons = {};
    elements.tabPanels = {};

    INSPECTOR_TABS.forEach(function (tabName) {
      elements.tabButtons[tabName] = document.getElementById("tab-button-" + tabName);
      elements.tabPanels[tabName] = document.getElementById("tab-panel-" + tabName);
    });
  }

  function setStatus(message, isError) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", !!isError);
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }

    return String(value);
  }

  function formatNumber(value, digits) {
    var precision = typeof digits === "number" ? digits : 2;

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }

    return String(Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision));
  }

  function formatBoolean(value) {
    if (value === true) {
      return "true";
    }

    if (value === false) {
      return "false";
    }

    return "-";
  }

  function formatPercent(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }

    return String(Math.round(value * 1000) / 10) + "%";
  }

  function copyTextToClipboard(text) {
    if (!text) {
      return Promise.resolve(false);
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard
        .writeText(text)
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
    }

    return new Promise(function (resolve) {
      try {
        var fallbackControl = document.createElement("textarea");
        fallbackControl.value = text;
        fallbackControl.setAttribute("readonly", "readonly");
        fallbackControl.style.position = "fixed";
        fallbackControl.style.opacity = "0";
        fallbackControl.style.pointerEvents = "none";
        document.body.appendChild(fallbackControl);
        fallbackControl.focus();
        fallbackControl.select();
        var didCopy = document.execCommand("copy");
        document.body.removeChild(fallbackControl);
        resolve(!!didCopy);
      } catch (error) {
        resolve(false);
      }
    });
  }

  function createPill(text, variant) {
    var pill = document.createElement("span");
    pill.className = "pill" + (variant ? " pill-" + variant : "");
    pill.textContent = text;
    return pill;
  }

  function createSvgIcon() {
    return document.createElementNS("http://www.w3.org/2000/svg", "svg");
  }

  function createSvgNode(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  function createVisibilityIcon(isHidden) {
    var svg = createSvgIcon();
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("row-action-icon");

    var eyePath = createSvgNode("path");
    eyePath.setAttribute(
      "d",
      "M1.5 8c1.7-2.6 4-3.9 6.5-3.9S12.8 5.4 14.5 8c-1.7 2.6-4 3.9-6.5 3.9S3.2 10.6 1.5 8Z"
    );
    eyePath.setAttribute("fill", "none");
    eyePath.setAttribute("stroke", "currentColor");
    eyePath.setAttribute("stroke-width", "1.4");
    eyePath.setAttribute("stroke-linecap", "round");
    eyePath.setAttribute("stroke-linejoin", "round");
    svg.appendChild(eyePath);

    var pupil = createSvgNode("circle");
    pupil.setAttribute("cx", "8");
    pupil.setAttribute("cy", "8");
    pupil.setAttribute("r", "1.7");
    pupil.setAttribute("fill", "currentColor");
    svg.appendChild(pupil);

    if (isHidden) {
      var slash = createSvgNode("path");
      slash.setAttribute("d", "M3 13 13 3");
      slash.setAttribute("fill", "none");
      slash.setAttribute("stroke", "currentColor");
      slash.setAttribute("stroke-width", "1.5");
      slash.setAttribute("stroke-linecap", "round");
      svg.appendChild(slash);
    }

    return svg;
  }

  function createOutlineIcon(isActive) {
    var svg = createSvgIcon();
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("row-action-icon");

    var frame = createSvgNode("rect");
    frame.setAttribute("x", "3");
    frame.setAttribute("y", "3");
    frame.setAttribute("width", "10");
    frame.setAttribute("height", "10");
    frame.setAttribute("rx", "1.5");
    frame.setAttribute("fill", "none");
    frame.setAttribute("stroke", "currentColor");
    frame.setAttribute("stroke-width", isActive ? "1.8" : "1.4");
    svg.appendChild(frame);

    if (isActive) {
      var glow = createSvgNode("rect");
      glow.setAttribute("x", "1.5");
      glow.setAttribute("y", "1.5");
      glow.setAttribute("width", "13");
      glow.setAttribute("height", "13");
      glow.setAttribute("rx", "2");
      glow.setAttribute("fill", "none");
      glow.setAttribute("stroke", "currentColor");
      glow.setAttribute("stroke-width", "1.2");
      glow.setAttribute("opacity", "0.6");
      svg.appendChild(glow);
    }

    return svg;
  }

  function getBranchHue(depth) {
    var hues = [112, 148, 184, 224, 268, 318, 42];
    return hues[depth % hues.length];
  }

  function renderToolbarButtons() {
    elements.pickButton.textContent = state.pickModeEnabled ? "Cancel pick" : "Pick on page";
    elements.resetAllButton.disabled =
      state.isRefreshing ||
      !state.selectedSceneKey ||
      !state.sceneObjects.some(function (displayObject) {
        return displayObject.changed;
      });
  }

  function isObjectOutlined(sceneKey, objectPath) {
    return state.outlinedSceneKey === sceneKey && state.outlinedObjectPath === objectPath;
  }

  function clearGameInfo() {
    elements.gameDetected.className = "detection-light is-unknown";
    elements.gameDetected.setAttribute("aria-label", "Phaser detection unknown");
    elements.gameWidth.textContent = "-";
    elements.gameHeight.textContent = "-";
    elements.gameRenderer.textContent = "-";
    elements.sceneCount.textContent = "-";
  }

  function renderGameInfo() {
    var game = state.snapshot && state.snapshot.game;

    if (!game) {
      clearGameInfo();
      return;
    }

    elements.gameDetected.className =
      "detection-light " + (state.snapshot.detected ? "is-detected" : "is-missing");
    elements.gameDetected.setAttribute(
      "aria-label",
      state.snapshot.detected ? "Phaser detected" : "Phaser not detected"
    );
    elements.gameWidth.textContent = formatNumber(game.width);
    elements.gameHeight.textContent = formatNumber(game.height);
    elements.gameRenderer.textContent = formatValue(game.rendererType);
    elements.sceneCount.textContent = formatValue(game.sceneCount);
  }

  function renderGameInfoVisibility() {
    elements.gameInfoToggle.textContent = state.gameInfoExpanded ? "Hide game info" : "Show game info";
    elements.gameInfoToggle.setAttribute("aria-expanded", state.gameInfoExpanded ? "true" : "false");
    elements.gameInfoCard.classList.toggle("hidden", !state.gameInfoExpanded);
  }

  function getParentPath(objectPath) {
    if (!objectPath) {
      return null;
    }

    var segments = objectPath.split(".");

    if (segments.length <= 1) {
      return null;
    }

    segments.pop();
    return segments.join(".");
  }

  function getPathSegments(objectPath) {
    if (!objectPath) {
      return [];
    }

    return objectPath.split(".");
  }

  function pathsSharePrefix(leftSegments, rightSegments, length) {
    if (length <= 0) {
      return true;
    }

    if (leftSegments.length < length || rightSegments.length < length) {
      return false;
    }

    for (var index = 0; index < length; index += 1) {
      if (leftSegments[index] !== rightSegments[index]) {
        return false;
      }
    }

    return true;
  }

  function shouldShowAncestorGuide(currentSegments, nextSegments, level) {
    return pathsSharePrefix(currentSegments, nextSegments, level + 1);
  }

  function shouldShowNodeGuideBottom(currentSegments, nextSegments) {
    if (currentSegments.length <= 1 || nextSegments.length === 0) {
      return false;
    }

    if (pathsSharePrefix(currentSegments, nextSegments, currentSegments.length)) {
      return true;
    }

    return (
      nextSegments.length === currentSegments.length &&
      pathsSharePrefix(currentSegments, nextSegments, currentSegments.length - 1)
    );
  }

  function createTreeGuides(displayObject, nextDisplayObject) {
    var currentSegments = getPathSegments(displayObject.path);
    var depth = Math.max(0, currentSegments.length - 1);

    if (depth === 0) {
      return null;
    }

    var nextSegments = nextDisplayObject ? getPathSegments(nextDisplayObject.path) : [];
    var guides = document.createElement("span");
    guides.className = "tree-guides";

    for (var level = 0; level < depth - 1; level += 1) {
      var ancestorGuide = document.createElement("span");
      ancestorGuide.className = "tree-guide";

      if (shouldShowAncestorGuide(currentSegments, nextSegments, level)) {
        ancestorGuide.className += " is-active";
      }

      guides.appendChild(ancestorGuide);
    }

    var nodeGuide = document.createElement("span");
    nodeGuide.className = "tree-guide tree-guide-node";

    if (shouldShowNodeGuideBottom(currentSegments, nextSegments)) {
      nodeGuide.className += " has-bottom";
    }

    guides.appendChild(nodeGuide);
    return guides;
  }

  function getSelectedSceneSummary() {
    var scenes = (state.snapshot && state.snapshot.scenes) || [];

    return (
      scenes.find(function (scene) {
        return scene.key === state.selectedSceneKey;
      }) || null
    );
  }

  function getSelectedSceneLabel() {
    return state.selectedSceneKey || "No scene selected";
  }

  function getSelectedSceneInspectorState() {
    if (state.sceneInspector && state.sceneInspector.state) {
      return state.sceneInspector.state;
    }

    return getSelectedSceneSummary();
  }

  function getSelectedSceneLoad() {
    if (state.sceneInspector && state.sceneInspector.load) {
      return state.sceneInspector.load;
    }

    var selectedScene = getSelectedSceneSummary();
    return selectedScene ? selectedScene.load : null;
  }

  function getSelectedSceneCamera() {
    if (state.sceneInspector && state.sceneInspector.camera) {
      return state.sceneInspector.camera;
    }

    var selectedScene = getSelectedSceneSummary();
    return selectedScene ? selectedScene.camera : null;
  }

  function getFpsMetrics() {
    if (state.sceneInspector && state.sceneInspector.fps) {
      return state.sceneInspector.fps;
    }

    return state.snapshot && state.snapshot.game ? state.snapshot.game.fps : null;
  }

  function trimFpsHistory() {
    var validKeys = {};
    var scenes = (state.snapshot && state.snapshot.scenes) || [];

    scenes.forEach(function (scene) {
      validKeys[scene.key] = true;
    });

    Object.keys(state.fpsHistoryByScene).forEach(function (sceneKey) {
      if (!validKeys[sceneKey]) {
        delete state.fpsHistoryByScene[sceneKey];
      }
    });
  }

  function recordFpsSample(sceneKey, fpsMetrics) {
    if (!sceneKey || !fpsMetrics || typeof fpsMetrics.actualFps !== "number" || !Number.isFinite(fpsMetrics.actualFps)) {
      return;
    }

    if (!state.fpsHistoryByScene[sceneKey]) {
      state.fpsHistoryByScene[sceneKey] = [];
    }

    state.fpsHistoryByScene[sceneKey].push(fpsMetrics.actualFps);

    if (state.fpsHistoryByScene[sceneKey].length > FPS_HISTORY_LIMIT) {
      state.fpsHistoryByScene[sceneKey].shift();
    }
  }

  function syncSceneInspectorFromSnapshot() {
    var selectedScene = getSelectedSceneSummary();

    if (!selectedScene) {
      state.sceneInspector = null;
      return;
    }

    state.sceneInspector = {
      sceneKey: selectedScene.key,
      state: selectedScene,
      load: selectedScene.load,
      camera: selectedScene.camera,
      fps: state.snapshot && state.snapshot.game ? state.snapshot.game.fps : null
    };

    recordFpsSample(selectedScene.key, state.sceneInspector.fps);
  }

  function applySceneInspectorData(inspectorData) {
    if (!inspectorData || inspectorData.sceneKey !== state.selectedSceneKey) {
      return;
    }

    state.sceneInspector = inspectorData;

    var selectedScene = getSelectedSceneSummary();

    if (selectedScene && inspectorData.state) {
      Object.keys(inspectorData.state).forEach(function (key) {
        selectedScene[key] = inspectorData.state[key];
      });
    }

    if (selectedScene && inspectorData.load) {
      selectedScene.load = inspectorData.load;
    }

    if (selectedScene && inspectorData.camera) {
      selectedScene.camera = inspectorData.camera;
    }

    if (state.snapshot && state.snapshot.game && inspectorData.fps) {
      state.snapshot.game.fps = inspectorData.fps;
    }

    recordFpsSample(inspectorData.sceneKey, inspectorData.fps);
  }

  function clearDetectedState() {
    state.selectedSceneKey = null;
    state.selectedObjectPath = null;
    state.outlinedSceneKey = null;
    state.outlinedObjectPath = null;
    state.sceneInspector = null;
    state.sceneObjects = [];
    state.objectDetails = null;
    state.expandedPaths = {};
    state.fpsHistoryByScene = {};
  }

  function applySnapshotState(snapshot, options) {
    var preserveSelection = !options || options.preserveSelection !== false;

    state.snapshot = snapshot;
    state.pickModeEnabled = !!(snapshot && snapshot.pickModeEnabled);

    if (!snapshot || !snapshot.detected) {
      clearDetectedState();
      return false;
    }

    var scenes = snapshot.scenes || [];
    var sceneStillExists = scenes.some(function (scene) {
      return scene.key === state.selectedSceneKey;
    });

    if (!preserveSelection || !sceneStillExists) {
      state.selectedSceneKey = scenes.length > 0 ? scenes[0].key : null;
      state.selectedObjectPath = null;
      state.objectDetails = null;
      state.outlinedSceneKey = null;
      state.outlinedObjectPath = null;
      state.expandedPaths = {};
    }

    trimFpsHistory();
    syncSceneInspectorFromSnapshot();
    return true;
  }

  function renderSceneList() {
    elements.sceneList.innerHTML = "";

    var scenes = (state.snapshot && state.snapshot.scenes) || [];

    if (scenes.length === 0) {
      elements.sceneList.innerHTML = '<p class="placeholder">No scenes found.</p>';
      return;
    }

    var fragment = document.createDocumentFragment();

    scenes.forEach(function (scene) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "list-row scene-row" + (scene.key === state.selectedSceneKey ? " selected" : "");
      button.dataset.sceneKey = scene.key;

      var title = document.createElement("div");
      title.className = "list-row-title";

      var name = document.createElement("span");
      name.textContent = scene.key;
      title.appendChild(name);
      title.appendChild(createPill(scene.active ? "active" : "inactive"));

      var meta = document.createElement("div");
      meta.className = "list-row-meta";
      meta.innerHTML =
        "<span>Visible: " +
        formatBoolean(scene.visible) +
        "</span><span>Status: " +
        formatValue(scene.statusLabel) +
        "</span>";

      button.appendChild(title);
      button.appendChild(meta);
      fragment.appendChild(button);
    });

    elements.sceneList.appendChild(fragment);
  }

  function renderBreadcrumbs() {
    elements.breadcrumbs.innerHTML = "";

    if (!state.selectedObjectPath) {
      elements.breadcrumbs.innerHTML = '<span class="breadcrumb-empty">No selection</span>';
      return;
    }

    var segments = getPathSegments(state.selectedObjectPath);
    var fragment = document.createDocumentFragment();
    var currentPath = "";

    segments.forEach(function (segment, index) {
      currentPath = currentPath ? currentPath + "." + segment : segment;

      var displayObject = getObjectByPath(currentPath);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "breadcrumb-button";
      button.dataset.breadcrumbPath = currentPath;
      button.textContent =
        (displayObject && (displayObject.name || displayObject.type)) || currentPath;
      fragment.appendChild(button);

      if (index < segments.length - 1) {
        var separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "/";
        fragment.appendChild(separator);
      }
    });

    elements.breadcrumbs.appendChild(fragment);
  }

  function renderInlineInspector(row, details) {
    var inspector = document.createElement("div");
    inspector.className = "inline-inspector";

    if (!details || !details.object) {
      inspector.innerHTML = '<p class="placeholder">Loading object details...</p>';
      row.appendChild(inspector);
      return;
    }

    var objectDetails = details.object;
    var changedProperties = objectDetails.changedProperties || {};
    var originalValues = objectDetails.originalValues || {};
    var hasChangedFields = Object.keys(changedProperties).some(function (property) {
      return changedProperties[property] === true;
    });

    if (hasChangedFields) {
      inspector.classList.add("has-changes");
    }

    var editableFields = [
      ["X", "x", objectDetails.x, "number", "1"],
      ["Y", "y", objectDetails.y, "number", "1"],
      ["Scale X", "scaleX", objectDetails.scaleX, "number", "1"],
      ["Scale Y", "scaleY", objectDetails.scaleY, "number", "1"],
      ["Alpha", "alpha", objectDetails.alpha, "number", "1"],
      ["Rotation", "rotation", objectDetails.rotation, "number", "1"],
      ["Visible", "visible", objectDetails.visible, "checkbox", null]
    ];
    var readonlyFields = [
      ["Name", objectDetails.name],
      ["Type", objectDetails.type],
      ["Path", objectDetails.path],
      ["Texture", objectDetails.textureKey],
      ["Children", formatValue(objectDetails.childCount)]
    ];

    var editableGroup = document.createElement("div");
    editableGroup.className = "inline-inspector-group";

    editableFields.forEach(function (field) {
      var isChanged = changedProperties[field[1]] === true;
      var item = document.createElement("label");
      item.className = "inline-inspector-item is-editable" + (isChanged ? " is-changed" : "");

      var labelWrap = document.createElement("span");
      labelWrap.className = "inline-inspector-label-wrap";

      var label = document.createElement("span");
      label.className = "inline-inspector-label";
      label.textContent = field[0];

      if (isChanged) {
        var originalValue = document.createElement("span");
        originalValue.className = "inline-inspector-original-value";
        originalValue.textContent = "[original value: " + formatValue(originalValues[field[1]]) + "]";
        label.appendChild(originalValue);
      }

      var copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "inline-inspector-copy-button";
      copyButton.dataset.action = "copySettingField";
      copyButton.dataset.objectPath = objectDetails.path;
      copyButton.dataset.copyLabel = field[0];
      copyButton.dataset.copyProperty = field[1];
      copyButton.dataset.copySource = "editable";
      copyButton.title = "Copy " + field[0];
      copyButton.setAttribute("aria-label", "Copy " + field[0]);
      copyButton.textContent = "";

      var controlWrap = document.createElement("span");
      controlWrap.className = "inline-inspector-control-wrap";

      var control = document.createElement("input");
      control.className = "inline-inspector-control";
      control.dataset.editKey = field[1];
      control.dataset.objectPath = objectDetails.path;

      if (field[3] === "checkbox") {
        control.type = "checkbox";
        control.checked = field[2] === true;
      } else {
        control.type = "number";
        control.step = field[4];
        control.value = typeof field[2] === "number" && Number.isFinite(field[2]) ? String(field[2]) : "";
      }

      controlWrap.appendChild(control);
      labelWrap.appendChild(label);
      labelWrap.appendChild(copyButton);
      item.appendChild(labelWrap);
      item.appendChild(controlWrap);
      editableGroup.appendChild(item);
    });

    var readonlyGroup = document.createElement("div");
    readonlyGroup.className = "inline-inspector-group is-readonly";

    readonlyFields.forEach(function (field) {
      var item = document.createElement("div");
      item.className = "inline-inspector-item";

      var labelWrap = document.createElement("span");
      labelWrap.className = "inline-inspector-label-wrap";

      var label = document.createElement("span");
      label.className = "inline-inspector-label";
      label.textContent = field[0];

      var copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "inline-inspector-copy-button";
      copyButton.dataset.action = "copySettingField";
      copyButton.dataset.objectPath = objectDetails.path;
      copyButton.dataset.copyLabel = field[0];
      copyButton.dataset.copySource = "readonly";
      copyButton.dataset.copyValue = formatValue(field[1]);
      copyButton.title = "Copy " + field[0];
      copyButton.setAttribute("aria-label", "Copy " + field[0]);
      copyButton.textContent = "";

      var value = document.createElement("span");
      value.className = "inline-inspector-value";
      value.textContent = formatValue(field[1]);

      labelWrap.appendChild(label);
      labelWrap.appendChild(copyButton);
      item.appendChild(labelWrap);
      item.appendChild(value);
      readonlyGroup.appendChild(item);
    });

    inspector.appendChild(editableGroup);
    inspector.appendChild(readonlyGroup);
    row.appendChild(inspector);
  }

  function getObjectByPath(objectPath) {
    return (
      state.sceneObjects.find(function (displayObject) {
        return displayObject.path === objectPath;
      }) || null
    );
  }

  function getObjectLabelByPath(objectPath) {
    var displayObject = getObjectByPath(objectPath);

    if (!displayObject) {
      return objectPath;
    }

    return displayObject.name || displayObject.type || objectPath;
  }

  function formatBreadcrumbTrail(objectPath) {
    if (!objectPath) {
      return "";
    }

    var segments = getPathSegments(objectPath);
    var currentPath = "";
    var breadcrumbLabels = [];

    segments.forEach(function (segment) {
      currentPath = currentPath ? currentPath + "." + segment : segment;
      breadcrumbLabels.push(getObjectLabelByPath(currentPath));
    });

    return breadcrumbLabels.join("/");
  }

  function getCurrentEditableValueText(objectPath, propertyKey) {
    if (!objectPath || !propertyKey || !elements.objectList) {
      return "";
    }

    var control = elements.objectList.querySelector(
      '.inline-inspector-control[data-object-path="' +
        objectPath +
        '"][data-edit-key="' +
        propertyKey +
        '"]'
    );

    if (!control) {
      return "";
    }

    if (control.type === "checkbox") {
      return control.checked ? "true" : "false";
    }

    return control.value;
  }

  function buildSettingCopyLine(label, valueText) {
    return String(label || "").trim() + ": " + String(valueText === undefined ? "" : valueText).trim();
  }

  function getChildrenOfPath(objectPath) {
    return state.sceneObjects.filter(function (displayObject) {
      return getParentPath(displayObject.path) === objectPath;
    });
  }

  function getFirstChildPath(objectPath) {
    var children = getChildrenOfPath(objectPath);
    return children.length > 0 ? children[0].path : null;
  }

  function ensureExpandedAncestors(objectPath) {
    var parentPath = getParentPath(objectPath);

    while (parentPath !== null) {
      state.expandedPaths[parentPath] = true;
      parentPath = getParentPath(parentPath);
    }
  }

  function getFilterQuery() {
    return state.filterQuery.trim().toLowerCase();
  }

  function matchesFilter(displayObject, query) {
    if (!query) {
      return true;
    }

    var haystack = [
      displayObject.name || "",
      displayObject.type || "",
      displayObject.path || ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.indexOf(query) !== -1;
  }

  function getFilterContextMap(query) {
    var context = {};

    if (!query) {
      return context;
    }

    state.sceneObjects.forEach(function (displayObject) {
      if (!matchesFilter(displayObject, query)) {
        return;
      }

      context[displayObject.path] = "match";

      var parentPath = getParentPath(displayObject.path);

      while (parentPath !== null) {
        if (!context[parentPath]) {
          context[parentPath] = "ancestor";
        }

        parentPath = getParentPath(parentPath);
      }
    });

    state.sceneObjects.forEach(function (displayObject) {
      var parentPath = getParentPath(displayObject.path);

      while (parentPath !== null) {
        if (context[parentPath] === "match" || context[parentPath] === "descendant") {
          if (!context[displayObject.path]) {
            context[displayObject.path] = "descendant";
          }

          break;
        }

        parentPath = getParentPath(parentPath);
      }
    });

    return context;
  }

  function shouldRenderObject(displayObject, contextMap, query) {
    if (query) {
      return !!contextMap[displayObject.path];
    }

    var parentPath = getParentPath(displayObject.path);

    while (parentPath !== null) {
      if (!state.expandedPaths[parentPath]) {
        return false;
      }

      parentPath = getParentPath(parentPath);
    }

    return true;
  }

  function getVisibleObjects() {
    var query = getFilterQuery();
    var contextMap = getFilterContextMap(query);

    if (query) {
      Object.keys(contextMap).forEach(function (path) {
        if (contextMap[path] === "ancestor" || contextMap[path] === "match") {
          state.expandedPaths[path] = true;
        }
      });
    }

    return state.sceneObjects.filter(function (displayObject) {
      return shouldRenderObject(displayObject, contextMap, query);
    });
  }

  function getVisiblePaths() {
    return getVisibleObjects().map(function (displayObject) {
      return displayObject.path;
    });
  }

  function rememberInspectorFocus(objectPath, editKey) {
    if (!objectPath || !editKey) {
      state.pendingInspectorFocus = null;
      state.pendingObjectListScrollTop = null;
      return;
    }

    state.pendingInspectorFocus = {
      objectPath: objectPath,
      editKey: editKey
    };
    state.pendingObjectListScrollTop = elements.objectList ? elements.objectList.scrollTop : null;
  }

  function rememberObjectListScroll() {
    state.pendingObjectListScrollTop = elements.objectList ? elements.objectList.scrollTop : null;
  }

  function restorePendingObjectListScroll() {
    if (state.pendingObjectListScrollTop === null || !elements.objectList) {
      return;
    }

    elements.objectList.scrollTop = state.pendingObjectListScrollTop;
    state.pendingObjectListScrollTop = null;
  }

  function restorePendingInspectorFocus() {
    if (!state.pendingInspectorFocus) {
      return;
    }

    var controls = elements.objectList.querySelectorAll(".inline-inspector-control");
    var focusTarget = null;

    Array.prototype.some.call(controls, function (control) {
      if (
        control.dataset &&
        control.dataset.objectPath === state.pendingInspectorFocus.objectPath &&
        control.dataset.editKey === state.pendingInspectorFocus.editKey
      ) {
        focusTarget = control;
        return true;
      }

      return false;
    });

    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }

    state.pendingInspectorFocus = null;
  }

  function rememberCameraFocus(property) {
    state.pendingCameraFocus = property ? { property: property } : null;
  }

  function restorePendingCameraFocus() {
    if (!state.pendingCameraFocus || !elements.cameraPanelContent) {
      return;
    }

    var control = elements.cameraPanelContent.querySelector(
      '[data-camera-property="' + state.pendingCameraFocus.property + '"]'
    );

    if (control) {
      control.focus({ preventScroll: true });
    }

    state.pendingCameraFocus = null;
  }

  function commitInspectorControlValue(control, options) {
    if (!control || !control.dataset) {
      return Promise.resolve();
    }

    if (options && options.preserveFocus) {
      rememberInspectorFocus(control.dataset.objectPath, control.dataset.editKey);
    }

    return updateObjectProperty(
      control.dataset.objectPath,
      control.dataset.editKey,
      control.type === "checkbox" ? control.checked : control.value,
      control.type
    );
  }

  function toggleObjectSelection(objectPath) {
    if (!objectPath) {
      return Promise.resolve();
    }

    if (objectPath === state.selectedObjectPath) {
      return clearSelectedObject();
    }

    return selectObject(objectPath);
  }

  function bindTreeRowSelect(mainButton, objectPath) {
    mainButton.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest("[data-action]")) {
        return;
      }

      toggleObjectSelection(objectPath).catch(function (error) {
        setStatus(error.message || "Failed to load object details", true);
      });
    });
  }

  function renderObjectList() {
    elements.objectList.innerHTML = "";

    if (!state.selectedSceneKey) {
      elements.objectListTitle.textContent = "Select a scene";
      elements.objectList.innerHTML = '<p class="placeholder">Pick a scene to inspect its object tree.</p>';
      renderBreadcrumbs();
      renderToolbarButtons();
      return;
    }

    var visibleObjects = getVisibleObjects();
    elements.objectListTitle.textContent =
      state.sceneObjects.length + " objects in " + state.selectedSceneKey;

    if (visibleObjects.length === 0) {
      elements.objectList.innerHTML = '<p class="placeholder">No matching objects found.</p>';
      renderBreadcrumbs();
      renderToolbarButtons();
      return;
    }

    var query = getFilterQuery();
    var contextMap = getFilterContextMap(query);
    var fragment = document.createDocumentFragment();

    visibleObjects.forEach(function (displayObject, index) {
      var row = document.createElement("div");
      row.className =
        "list-row tree-row" +
        (displayObject.path === state.selectedObjectPath ? " selected" : "") +
        (displayObject.changed ? " has-changes" : "") +
        (displayObject.childCount > 0 ? " has-children" : " is-leaf") +
        (state.expandedPaths[displayObject.path] ? " is-expanded" : "");

      if (query && contextMap[displayObject.path]) {
        row.className += " is-filter-" + contextMap[displayObject.path];
      }

      row.dataset.objectPath = displayObject.path;
      row.style.setProperty("--depth", String(displayObject.depth || 0));
      row.style.setProperty("--branch-h", String(getBranchHue(displayObject.depth || 0)));

      var header = document.createElement("div");
      header.className = "tree-row-header";

      var mainButton = document.createElement("button");
      mainButton.type = "button";
      mainButton.className = "tree-row-select";
      mainButton.dataset.objectPath = displayObject.path;

      var main = document.createElement("div");
      main.className = "tree-row-main";

      var guides = createTreeGuides(displayObject, visibleObjects[index + 1] || null);

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle" + (displayObject.childCount > 0 ? "" : " is-spacer");
      toggle.dataset.togglePath = displayObject.path;
      toggle.disabled = displayObject.childCount === 0;
      toggle.textContent =
        displayObject.childCount > 0
          ? state.expandedPaths[displayObject.path]
            ? "−"
            : "+"
          : "·";

      if (guides) {
        main.appendChild(guides);
      }

      main.appendChild(toggle);
      bindTreeRowSelect(mainButton, displayObject.path);

      var actions = document.createElement("div");
      actions.className = "tree-row-actions tree-row-actions-inline";

      var infoButton = document.createElement("button");
      infoButton.type = "button";
      infoButton.className =
        "row-action-button row-action-icon-button" +
        (displayObject.path === state.selectedObjectPath ? " is-active" : "");
      infoButton.dataset.action = "info";
      infoButton.dataset.objectPath = displayObject.path;
      infoButton.setAttribute(
        "aria-label",
        displayObject.path === state.selectedObjectPath ? "Close object details" : "Show object details"
      );
      infoButton.title =
        displayObject.path === state.selectedObjectPath ? "Close details" : "Show details";
      infoButton.textContent = "i";

      var outlineButton = document.createElement("button");
      outlineButton.type = "button";
      outlineButton.className =
        "row-action-button row-action-icon-button" +
        (isObjectOutlined(state.selectedSceneKey, displayObject.path) ? " is-active" : "");
      outlineButton.dataset.action = "outline";
      outlineButton.dataset.objectPath = displayObject.path;
      outlineButton.setAttribute(
        "aria-label",
        isObjectOutlined(state.selectedSceneKey, displayObject.path) ? "Hide outline" : "Show outline"
      );
      outlineButton.title = isObjectOutlined(state.selectedSceneKey, displayObject.path)
        ? "Hide outline"
        : "Show outline";
      outlineButton.appendChild(
        createOutlineIcon(isObjectOutlined(state.selectedSceneKey, displayObject.path))
      );

      var visibilityButton = document.createElement("button");
      visibilityButton.type = "button";
      visibilityButton.className = "row-action-button row-action-icon-button";
      visibilityButton.dataset.action = "visibility";
      visibilityButton.dataset.objectPath = displayObject.path;
      visibilityButton.setAttribute(
        "aria-label",
        displayObject.visible === false ? "Show object" : "Hide object"
      );
      visibilityButton.title = displayObject.visible === false ? "Show object" : "Hide object";
      visibilityButton.appendChild(createVisibilityIcon(displayObject.visible === false));

      actions.appendChild(outlineButton);
      actions.appendChild(visibilityButton);
      actions.appendChild(infoButton);

      var name = document.createElement("span");
      name.className = "tree-row-name";
      name.textContent = displayObject.name || displayObject.type || "Unnamed object";

      if (displayObject.changed) {
        var changedIndicator = document.createElement("span");
        changedIndicator.className = "tree-row-change-indicator";
        changedIndicator.textContent = "modified";
        changedIndicator.title = "This object has values changed from the original";
        name.appendChild(changedIndicator);
      }

      var detailsForRow =
        state.objectDetails &&
        state.objectDetails.object &&
        state.objectDetails.object.path === displayObject.path
          ? state.objectDetails.object
          : null;

      if (
        displayObject.path === state.selectedObjectPath &&
        detailsForRow
      ) {
        var titleRow = document.createElement("div");
        titleRow.className = "tree-row-title-row";

        var titleActions = document.createElement("div");
        titleActions.className = "tree-row-title-actions";

        var copyPathButton = document.createElement("button");
        copyPathButton.type = "button";
        copyPathButton.className = "tree-row-copy-button";
        copyPathButton.dataset.action = "copyPath";
        copyPathButton.dataset.objectPath = detailsForRow.path;
        copyPathButton.textContent = "Copy breadcrumb";
        copyPathButton.title = "Copy full breadcrumb path";

        titleRow.appendChild(name);
        titleActions.appendChild(copyPathButton);

        if (detailsForRow.canReset) {
          var resetButton = document.createElement("button");
          resetButton.type = "button";
          resetButton.className = "tree-row-reset-button";
          resetButton.dataset.action = "reset";
          resetButton.dataset.objectPath = detailsForRow.path;
          resetButton.textContent = "Reset";
          resetButton.title = "Restore original transform and visibility";
          titleActions.appendChild(resetButton);
        }

        titleRow.appendChild(titleActions);
        mainButton.appendChild(titleRow);
      } else {
        mainButton.appendChild(name);
      }

      var meta = document.createElement("div");
      meta.className = "tree-row-meta";

      var position = document.createElement("span");
      position.textContent = formatNumber(displayObject.x) + ", " + formatNumber(displayObject.y);
      meta.appendChild(position);

      meta.appendChild(createPill(displayObject.type || "Unknown"));

      if (displayObject.childCount > 0) {
        meta.appendChild(createPill(String(displayObject.childCount)));
      }

      if (displayObject.visible === false) {
        meta.appendChild(createPill("hidden", "hidden"));
      }

      main.appendChild(actions);
      mainButton.appendChild(meta);
      main.appendChild(mainButton);

      header.appendChild(main);
      row.appendChild(header);

      if (displayObject.path === state.selectedObjectPath) {
        renderInlineInspector(row, state.objectDetails);
      }

      fragment.appendChild(row);
    });

    elements.objectList.appendChild(fragment);
    renderBreadcrumbs();
    renderToolbarButtons();

    var selectedRow = elements.objectList.querySelector(
      '.tree-row[data-object-path="' + state.selectedObjectPath + '"]'
    );
    var shouldPreserveObjectListScroll = state.pendingObjectListScrollTop !== null;

    restorePendingObjectListScroll();

    if (selectedRow && !state.pendingInspectorFocus && !shouldPreserveObjectListScroll) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }

    restorePendingInspectorFocus();
  }

  function createInfoGrid(items) {
    var grid = document.createElement("div");
    grid.className = "inspector-info-grid";

    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "inspector-info-row";

      var label = document.createElement("span");
      label.className = "inspector-info-label";
      label.textContent = item[0];

      var value = document.createElement("span");
      value.className = "inspector-info-value";
      value.textContent = formatValue(item[1]);

      row.appendChild(label);
      row.appendChild(value);
      grid.appendChild(row);
    });

    return grid;
  }

  function createPlaceholder(message) {
    var placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = message;
    return placeholder;
  }

  function renderSceneInspectorHeader() {
    var sceneState = getSelectedSceneInspectorState();

    if (!state.selectedSceneKey || !sceneState) {
      elements.sceneInspectorTitle.textContent = "Select a scene";
      elements.sceneInspectorStatus.textContent = "No scene selected";
      elements.selectedSceneName.textContent = "No scene selected";
      elements.selectedScenePills.innerHTML = "";
      elements.selectedSceneMeta.innerHTML = "";
      elements.sceneInspectorHeader.classList.add("is-empty");
      return;
    }

    elements.sceneInspectorHeader.classList.remove("is-empty");
    elements.sceneInspectorTitle.textContent = "";
    elements.sceneInspectorStatus.textContent = elements.tabButtons[state.activeInspectorTab].textContent;
    elements.selectedSceneName.textContent = sceneState.key;
    elements.selectedScenePills.innerHTML = "";
    elements.selectedSceneMeta.innerHTML = "";

    elements.selectedScenePills.appendChild(
      createPill(
        sceneState.active === true ? "active" : sceneState.active === false ? "inactive" : "unknown"
      )
    );
    elements.selectedScenePills.appendChild(
      createPill(
        sceneState.visible === true ? "visible" : sceneState.visible === false ? "hidden" : "unknown"
      )
    );

    if (sceneState.statusLabel) {
      elements.selectedScenePills.appendChild(createPill(sceneState.statusLabel.toLowerCase(), "status"));
    }

    var metaItems = [
      "Status: " + formatValue(sceneState.statusLabel),
      "Paused: " + formatBoolean(sceneState.isPaused),
      "Sleeping: " + formatBoolean(sceneState.isSleeping)
    ];

    metaItems.forEach(function (text) {
      var item = document.createElement("span");
      item.className = "scene-inspector-meta-item";
      item.textContent = text;
      elements.selectedSceneMeta.appendChild(item);
    });
  }

  function renderInspectorTabs() {
    INSPECTOR_TABS.forEach(function (tabName) {
      var isActive = state.activeInspectorTab === tabName;
      elements.tabButtons[tabName].classList.toggle("is-active", isActive);
      elements.tabButtons[tabName].setAttribute("aria-selected", isActive ? "true" : "false");
      elements.tabPanels[tabName].classList.toggle("hidden", !isActive);
    });
  }

  function renderStatePanel() {
    elements.statePanelContent.innerHTML = "";

    var sceneState = getSelectedSceneInspectorState();

    if (!sceneState) {
      elements.statePanelContent.appendChild(createPlaceholder("Select a scene to inspect its state."));
      return;
    }

    var actions = sceneState.sceneActions || {};
    var actionGrid = document.createElement("div");
    actionGrid.className = "scene-action-grid";

    ["pause", "resume", "sleep", "wake", "stop", "restart", "remove"].forEach(function (actionName) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "scene-action-button";
      button.dataset.sceneAction = actionName;
      button.disabled = !actions[actionName];
      button.textContent = actionName.charAt(0).toUpperCase() + actionName.slice(1);
      actionGrid.appendChild(button);
    });

    elements.statePanelContent.appendChild(actionGrid);
    elements.statePanelContent.appendChild(
      createInfoGrid([
        ["Active", formatBoolean(sceneState.active)],
        ["Visible", formatBoolean(sceneState.visible)],
        ["Paused", formatBoolean(sceneState.isPaused)],
        ["Sleeping", formatBoolean(sceneState.isSleeping)],
        ["Status", formatValue(sceneState.statusLabel)]
      ])
    );
  }

  function renderLoadPanel() {
    elements.loadPanelContent.innerHTML = "";

    var load = getSelectedSceneLoad();

    if (!load) {
      elements.loadPanelContent.appendChild(createPlaceholder("Select a scene to inspect loader metrics."));
      return;
    }

    var hasLoadData =
      load.isLoading === true ||
      (typeof load.totalToLoad === "number" && load.totalToLoad > 0) ||
      (typeof load.totalComplete === "number" && load.totalComplete > 0) ||
      (typeof load.totalFailed === "number" && load.totalFailed > 0);

    var progressCard = document.createElement("div");
    progressCard.className = "progress-card";

    var progressHeader = document.createElement("div");
    progressHeader.className = "progress-card-header";
    progressHeader.innerHTML =
      "<span>Progress</span><strong>" + formatPercent(load.progress || 0) + "</strong>";

    var progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";

    var progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.style.width = Math.max(0, Math.min(100, (load.progress || 0) * 100)) + "%";

    progressTrack.appendChild(progressFill);
    progressCard.appendChild(progressHeader);
    progressCard.appendChild(progressTrack);
    elements.loadPanelContent.appendChild(progressCard);

    elements.loadPanelContent.appendChild(
      createInfoGrid([
        ["Loading", formatBoolean(load.isLoading)],
        ["totalComplete", formatNumber(load.totalComplete)],
        ["totalFailed", formatNumber(load.totalFailed)],
        ["totalToLoad", formatNumber(load.totalToLoad)]
      ])
    );

    if (!hasLoadData) {
      elements.loadPanelContent.appendChild(
        createPlaceholder("No loader activity is currently reported for this scene.")
      );
    }
  }

  function createCameraGroup(title, fields) {
    var section = document.createElement("div");
    section.className = "camera-group";

    var heading = document.createElement("h3");
    heading.className = "camera-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    var grid = document.createElement("div");
    grid.className = "camera-grid";

    fields.forEach(function (field) {
      var item = document.createElement(field.editable ? "label" : "div");
      item.className = "camera-row" + (field.editable ? " is-editable" : "");

      var label = document.createElement("span");
      label.className = "camera-label";
      label.textContent = field.label;

      item.appendChild(label);

      if (field.editable) {
        var controlWrap = document.createElement("span");
        controlWrap.className = "camera-control-wrap";

        var control = document.createElement("input");
        control.className = "camera-control";
        control.dataset.cameraProperty = field.property;
        control.dataset.valueType = field.type;
        control.type = field.inputType || field.type;

        if (field.type === "checkbox") {
          control.checked = field.value === true;
        } else {
          control.value = field.value === null || field.value === undefined ? "" : String(field.value);
        }

        if (field.step) {
          control.step = field.step;
        }

        controlWrap.appendChild(control);
        item.appendChild(controlWrap);
      } else {
        var value = document.createElement("span");
        value.className = "camera-value";
        value.textContent = formatValue(field.value);
        item.appendChild(value);
      }

      grid.appendChild(item);
    });

    section.appendChild(grid);
    return section;
  }

  function createCameraActionGrid(camera) {
    var actions = (camera && camera.actions) || {};
    var grid = document.createElement("div");
    grid.className = "scene-action-grid camera-action-grid";

    [
      ["fadeIn", "Fade in"],
      ["fadeOut", "Fade out"],
      ["flash", "Flash"],
      ["resetFX", "Reset effects"],
      ["shake", "Shake"],
      ["destroy", "Destroy"]
    ].forEach(function (definition) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "scene-action-button";
      button.dataset.cameraAction = definition[0];
      button.disabled = !actions[definition[0]];
      button.textContent = definition[1];
      grid.appendChild(button);
    });

    return grid;
  }

  function renderCameraPanel() {
    elements.cameraPanelContent.innerHTML = "";

    var camera = getSelectedSceneCamera();

    if (!camera) {
      elements.cameraPanelContent.appendChild(createPlaceholder("This scene does not expose a main camera."));
      return;
    }

    elements.cameraPanelContent.appendChild(createCameraActionGrid(camera));

    elements.cameraPanelContent.appendChild(
      createCameraGroup("Editable", [
        { label: "X", property: "x", value: camera.x, type: "number", step: "1", editable: true },
        { label: "Y", property: "y", value: camera.y, type: "number", step: "1", editable: true },
        {
          label: "Width",
          property: "width",
          value: camera.width,
          type: "number",
          step: "1",
          editable: true
        },
        {
          label: "Height",
          property: "height",
          value: camera.height,
          type: "number",
          step: "1",
          editable: true
        },
        {
          label: "Scroll X",
          property: "scrollX",
          value: camera.scrollX,
          type: "number",
          step: "1",
          editable: true
        },
        {
          label: "Scroll Y",
          property: "scrollY",
          value: camera.scrollY,
          type: "number",
          step: "1",
          editable: true
        },
        {
          label: "Zoom",
          property: "zoom",
          value: camera.zoom,
          type: "number",
          step: "0.1",
          editable: true
        },
        {
          label: "Rotation",
          property: "rotation",
          value: camera.rotation,
          type: "number",
          step: "0.01",
          editable: true
        },
        {
          label: "Round Pixels",
          property: "roundPixels",
          value: camera.roundPixels,
          type: "checkbox",
          editable: true
        },
        {
          label: "Visible",
          property: "visible",
          value: camera.visible,
          type: "checkbox",
          editable: true
        },
        {
          label: "Background",
          property: "backgroundColor",
          value: typeof camera.backgroundColor === "string" && camera.backgroundColor.charAt(0) === "#"
            ? camera.backgroundColor
            : "#000000",
          type: "color",
          inputType: "color",
          editable: true
        }
      ])
    );

    elements.cameraPanelContent.appendChild(
      createCameraGroup("Read-only", [
        { label: "Name", value: camera.name },
        { label: "Alpha", value: formatNumber(camera.alpha) },
        { label: "Origin X", value: formatNumber(camera.originX) },
        { label: "Origin Y", value: formatNumber(camera.originY) },
        { label: "Center X", value: formatNumber(camera.centerX) },
        { label: "Center Y", value: formatNumber(camera.centerY) },
        { label: "World X", value: formatNumber(camera.worldViewX) },
        { label: "World Y", value: formatNumber(camera.worldViewY) },
        { label: "World Width", value: formatNumber(camera.worldViewWidth) },
        { label: "World Height", value: formatNumber(camera.worldViewHeight) }
      ])
    );

    restorePendingCameraFocus();
  }

  function createFpsGraph(samples, metrics) {
    var wrapper = document.createElement("div");
    wrapper.className = "fps-graph-card";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 320 96");
    svg.setAttribute("class", "fps-graph");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Frames per second history");

    var topGuide = document.createElementNS("http://www.w3.org/2000/svg", "line");
    topGuide.setAttribute("x1", "0");
    topGuide.setAttribute("y1", "12");
    topGuide.setAttribute("x2", "320");
    topGuide.setAttribute("y2", "12");
    topGuide.setAttribute("class", "fps-guide");

    var midGuide = document.createElementNS("http://www.w3.org/2000/svg", "line");
    midGuide.setAttribute("x1", "0");
    midGuide.setAttribute("y1", "48");
    midGuide.setAttribute("x2", "320");
    midGuide.setAttribute("y2", "48");
    midGuide.setAttribute("class", "fps-guide");

    var bottomGuide = document.createElementNS("http://www.w3.org/2000/svg", "line");
    bottomGuide.setAttribute("x1", "0");
    bottomGuide.setAttribute("y1", "84");
    bottomGuide.setAttribute("x2", "320");
    bottomGuide.setAttribute("y2", "84");
    bottomGuide.setAttribute("class", "fps-guide");

    svg.appendChild(topGuide);
    svg.appendChild(midGuide);
    svg.appendChild(bottomGuide);

    var usableSamples = samples.length > 0 ? samples : [metrics && metrics.actualFps ? metrics.actualFps : 0];
    var maxValue = Math.max(1, Math.max.apply(Math, usableSamples.concat([metrics && metrics.targetFps ? metrics.targetFps : 60])));
    var points = usableSamples
      .map(function (sample, index) {
        var x = usableSamples.length === 1 ? 160 : (320 / Math.max(1, usableSamples.length - 1)) * index;
        var y = 84 - (Math.max(0, sample) / maxValue) * 72;
        return x.toFixed(2) + "," + y.toFixed(2);
      })
      .join(" ");

    var polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", "fps-line");
    svg.appendChild(polyline);

    wrapper.appendChild(svg);
    return wrapper;
  }

  function renderFpsPanel() {
    elements.fpsPanelContent.innerHTML = "";

    if (!state.selectedSceneKey) {
      elements.fpsPanelContent.appendChild(createPlaceholder("Select a scene to inspect FPS data."));
      return;
    }

    var metrics = getFpsMetrics() || {};
    var samples = state.fpsHistoryByScene[state.selectedSceneKey] || [];

    elements.fpsPanelContent.appendChild(createFpsGraph(samples, metrics));
    elements.fpsPanelContent.appendChild(
      createInfoGrid([
        ["actualFps", formatNumber(metrics.actualFps)],
        ["targetFps", formatNumber(metrics.targetFps)],
        ["fpsLimit", formatNumber(metrics.fpsLimit)],
        ["delta", formatNumber(metrics.delta)],
        ["rawDelta", formatNumber(metrics.rawDelta)]
      ])
    );
  }

  function renderSceneInspectorPanels() {
    renderSceneInspectorHeader();
    renderInspectorTabs();
    renderStatePanel();
    renderLoadPanel();
    renderCameraPanel();
    renderFpsPanel();
  }

  function renderContentVisibility() {
    var detected = !!(state.snapshot && state.snapshot.detected);

    elements.emptyState.classList.toggle("hidden", detected);
    elements.content.classList.toggle("hidden", !detected);
  }

  function renderAll() {
    renderContentVisibility();
    renderGameInfoVisibility();
    renderGameInfo();
    renderSceneList();
    renderSceneInspectorPanels();
    renderObjectList();
    renderToolbarButtons();
  }

  function queueRefresh() {
    state.refreshQueued = true;
  }

  function hasChangedObjectDetails(objectDetails) {
    var changedProperties = objectDetails && objectDetails.changedProperties;

    if (!changedProperties) {
      return false;
    }

    return Object.keys(changedProperties).some(function (property) {
      return changedProperties[property] === true;
    });
  }

  function syncPageHighlight() {
    if (!state.outlinedSceneKey || !state.outlinedObjectPath) {
      return window.PhaserBridge.clearHighlight();
    }

    var highlightedObject =
      state.objectDetails &&
      state.objectDetails.object &&
      state.objectDetails.object.path === state.outlinedObjectPath
        ? state.objectDetails.object
        : null;
    var highlightedSummary = getObjectByPath(state.outlinedObjectPath);

    return window.PhaserBridge.highlightObject(
      state.outlinedSceneKey,
      state.outlinedObjectPath,
      hasChangedObjectDetails(highlightedObject) || !!(highlightedSummary && highlightedSummary.changed)
    );
  }

  async function loadSelectedSceneInspector() {
    if (!state.selectedSceneKey || !state.snapshot || !state.snapshot.detected) {
      state.sceneInspector = null;
      renderSceneInspectorPanels();
      return;
    }

    var requestId = state.sceneInspectorRequestId + 1;
    state.sceneInspectorRequestId = requestId;

    var inspectorData = await window.PhaserBridge.getSceneInspector(state.selectedSceneKey);

    if (requestId !== state.sceneInspectorRequestId) {
      return;
    }

    applySceneInspectorData(inspectorData);
    renderSceneInspectorPanels();
  }

  async function loadSelectedSceneObjects() {
    if (!state.selectedSceneKey) {
      state.sceneObjects = [];
      state.objectDetails = null;
      renderObjectList();
      return;
    }

    var requestId = state.sceneRequestId + 1;
    state.sceneRequestId = requestId;

    elements.objectList.innerHTML = '<p class="placeholder">Loading object tree...</p>';
    elements.objectListTitle.textContent = "Loading...";

    var sceneData = await window.PhaserBridge.getSceneObjects(state.selectedSceneKey);

    if (requestId !== state.sceneRequestId) {
      return;
    }

    state.sceneObjects = Array.isArray(sceneData.objects) ? sceneData.objects : [];

    if (state.selectedObjectPath) {
      ensureExpandedAncestors(state.selectedObjectPath);
    }

    renderObjectList();
  }

  async function loadSelectedObjectDetails() {
    if (state.selectedSceneKey === null || state.selectedObjectPath === null) {
      state.objectDetails = null;
      renderObjectList();
      return;
    }

    var requestId = state.inspectorRequestId + 1;
    state.inspectorRequestId = requestId;

    renderObjectList();

    var details = await window.PhaserBridge.getObjectDetails(
      state.selectedSceneKey,
      state.selectedObjectPath
    );

    if (requestId !== state.inspectorRequestId) {
      return;
    }

    state.objectDetails = details && details.object ? details : null;
    renderObjectList();
  }

  async function hydrateFromSnapshot(snapshot, options) {
    var detected = applySnapshotState(snapshot, options);
    renderAll();

    if (!detected) {
      return;
    }

    await loadSelectedSceneObjects();

    if (state.selectedObjectPath !== null) {
      var selectedObjectStillExists = state.sceneObjects.some(function (displayObject) {
        return displayObject.path === state.selectedObjectPath;
      });

      if (!selectedObjectStillExists) {
        state.selectedObjectPath = null;
        state.objectDetails = null;
      }
    }

    renderObjectList();

    if (state.selectedObjectPath !== null) {
      await loadSelectedObjectDetails();
      await syncPageHighlight();
    } else {
      await window.PhaserBridge.clearHighlight();
    }

    await loadSelectedSceneInspector();
  }

  async function refreshData(options) {
    var preserveSelection = !options || options.preserveSelection !== false;

    if (state.isRefreshing) {
      queueRefresh();
      return;
    }

    state.isRefreshing = true;
    elements.refreshButton.disabled = true;
    elements.pickButton.disabled = true;
    renderToolbarButtons();
    setStatus("Refreshing...", false);

    try {
      var snapshot = await window.PhaserBridge.getGameSnapshot();
      await hydrateFromSnapshot(snapshot, { preserveSelection: preserveSelection });

      if (!snapshot.detected) {
        setStatus("No Phaser game detected on this page", false);
        return;
      }

      setStatus("Phaser detected" + (state.selectedSceneKey ? " in " + state.selectedSceneKey : ""), false);
    } catch (error) {
      setStatus(error.message || "Failed to refresh panel data", true);
    } finally {
      state.isRefreshing = false;
      state.lastRefreshAt = Date.now();
      elements.refreshButton.disabled = false;
      elements.pickButton.disabled = false;
      renderToolbarButtons();

      if (state.refreshQueued) {
        state.refreshQueued = false;
        refreshData({ preserveSelection: true });
      }
    }
  }

  async function applySelectedObject(sceneKey, objectPath, sourceLabel) {
    state.selectedSceneKey = sceneKey;
    state.selectedObjectPath = objectPath;
    state.outlinedSceneKey = sceneKey;
    state.outlinedObjectPath = objectPath;
    state.activeInspectorTab = "displayObjects";
    ensureExpandedAncestors(objectPath);

    syncSceneInspectorFromSnapshot();
    renderSceneList();
    renderSceneInspectorPanels();
    await loadSelectedSceneObjects();

    var objectStillExists = state.sceneObjects.some(function (displayObject) {
      return displayObject.path === objectPath;
    });

    if (!objectStillExists) {
      state.selectedObjectPath = null;
      state.objectDetails = null;
      renderObjectList();
      setStatus("Could not resolve the selected object anymore", true);
      return;
    }

    renderObjectList();
    await loadSelectedObjectDetails();
    await loadSelectedSceneInspector();
    await syncPageHighlight();
    setStatus(sourceLabel, false);
  }

  async function selectObject(objectPath) {
    if (!objectPath) {
      return;
    }

    state.activeInspectorTab = "displayObjects";
    state.selectedObjectPath = objectPath;
    state.outlinedSceneKey = state.selectedSceneKey;
    state.outlinedObjectPath = objectPath;
    ensureExpandedAncestors(objectPath);
    renderSceneInspectorPanels();
    renderObjectList();
    elements.objectList.focus();
    setStatus("Loading object " + objectPath + "...", false);

    await loadSelectedObjectDetails();
    await syncPageHighlight();
    setStatus("Inspecting object " + objectPath, false);
  }

  async function clearSelectedObject() {
    state.selectedObjectPath = null;
    state.objectDetails = null;
    state.outlinedSceneKey = null;
    state.outlinedObjectPath = null;
    renderObjectList();
    await window.PhaserBridge.clearHighlight();
    setStatus("Closed object inspector", false);
  }

  async function changeObjectVisibility(objectPath) {
    var objectSummary = getObjectByPath(objectPath);

    if (!objectSummary) {
      return;
    }

    rememberObjectListScroll();

    var nextVisible = objectSummary.visible === false;
    var details = await window.PhaserBridge.setObjectVisibility(
      state.selectedSceneKey,
      objectPath,
      nextVisible
    );

    await loadSelectedSceneObjects();

    if (state.selectedObjectPath === objectPath) {
      state.objectDetails = details && details.object ? details : null;
      renderObjectList();
      await syncPageHighlight();
    } else if (state.selectedObjectPath) {
      renderObjectList();
    }

    setStatus((nextVisible ? "Showed " : "Hid ") + objectPath, false);
  }

  async function resetObjectEdits(objectPath) {
    if (!objectPath || !state.selectedSceneKey) {
      return;
    }

    rememberObjectListScroll();

    var result = await window.PhaserBridge.resetObjectEdits(state.selectedSceneKey, objectPath);

    if (result && result.error) {
      setStatus(result.error, true);
      return;
    }

    await loadSelectedSceneObjects();

    if (state.selectedObjectPath === objectPath) {
      state.objectDetails = result && result.object ? result : null;
      renderObjectList();
      await syncPageHighlight();
    } else {
      renderObjectList();
    }

    setStatus("Reset edits on " + objectPath, false);
  }

  async function resetAllObjectEdits() {
    if (!state.selectedSceneKey) {
      return;
    }

    rememberObjectListScroll();
    elements.resetAllButton.disabled = true;
    setStatus("Resetting changed values in " + state.selectedSceneKey + "...", false);

    var result = await window.PhaserBridge.resetAllObjectEdits(state.selectedSceneKey);

    if (result && result.error) {
      setStatus(result.error, true);
      renderToolbarButtons();
      return;
    }

    await loadSelectedSceneObjects();

    if (state.selectedObjectPath) {
      await loadSelectedObjectDetails();
    }

    await syncPageHighlight();
    setStatus("Reset " + formatValue(result && result.resetCount) + " changed object(s)", false);
  }

  function isEditableInspectorTarget(target) {
    return !!(target && target.closest(".inline-inspector-control"));
  }

  function isEditingCameraControl() {
    return !!(
      state.activeInspectorTab === "camera" &&
      document.activeElement &&
      document.activeElement.closest &&
      document.activeElement.closest("[data-camera-property]")
    );
  }

  async function updateObjectProperty(objectPath, property, rawValue, valueType) {
    if (!objectPath || !property || !state.selectedSceneKey) {
      return;
    }

    if (state.selectedObjectPath !== objectPath) {
      await selectObject(objectPath);
    }

    var value = rawValue;

    if (valueType !== "checkbox") {
      if (rawValue === "") {
        setStatus("Value cannot be empty", true);
        return;
      }

      value = Number(rawValue);

      if (!Number.isFinite(value)) {
        setStatus("Value must be a valid number", true);
        return;
      }
    }

    var result = await window.PhaserBridge.updateObjectProperty(
      state.selectedSceneKey,
      objectPath,
      property,
      valueType === "checkbox" ? !!rawValue : value
    );

    if (result && result.error) {
      setStatus(result.error, true);
      return;
    }

    state.objectDetails = result && result.object ? result : null;
    await loadSelectedSceneObjects();
    await syncPageHighlight();
    setStatus("Updated " + property + " on " + objectPath, false);
  }

  async function updateSceneCameraPropertyFromControl(control) {
    if (!control || !control.dataset || !state.selectedSceneKey) {
      return;
    }

    var property = control.dataset.cameraProperty;
    var valueType = control.dataset.valueType;
    var value = control.type === "checkbox" ? control.checked : control.value;

    if (valueType === "number") {
      if (value === "") {
        setStatus("Camera value cannot be empty", true);
        return;
      }

      value = Number(value);

      if (!Number.isFinite(value)) {
        setStatus("Camera value must be a valid number", true);
        return;
      }
    }

    rememberCameraFocus(property);

    var result = await window.PhaserBridge.updateSceneCameraProperty(
      state.selectedSceneKey,
      property,
      valueType === "checkbox" ? !!value : value
    );

    if (result && result.error) {
      setStatus(result.error, true);
      return;
    }

    if (state.sceneInspector) {
      state.sceneInspector.camera = result.camera;
    }

    var selectedScene = getSelectedSceneSummary();

    if (selectedScene) {
      selectedScene.camera = result.camera;
    }

    renderCameraPanel();
    setStatus("Updated camera " + property + " in " + state.selectedSceneKey, false);
  }

  async function performSceneAction(actionName) {
    if (!state.selectedSceneKey) {
      return;
    }

    var result = await window.PhaserBridge.performSceneAction(state.selectedSceneKey, actionName);

    if (!result || result.ok === false) {
      setStatus((result && result.error) || "Failed to change scene state", true);
      return;
    }

    await hydrateFromSnapshot(result.snapshot, { preserveSelection: true });
    setStatus(
      result.removed ? "Removed scene " + result.sceneKey : "Applied " + actionName + " to " + result.sceneKey,
      false
    );
  }

  async function performCameraAction(actionName) {
    if (!state.selectedSceneKey) {
      return;
    }

    var result = await window.PhaserBridge.performCameraAction(state.selectedSceneKey, actionName);

    if (!result || result.ok === false) {
      setStatus((result && result.error) || "Failed to change camera state", true);
      return;
    }

    await hydrateFromSnapshot(result.snapshot, { preserveSelection: true });

    if (result.camera && state.sceneInspector) {
      state.sceneInspector.camera = result.camera;
    }

    setStatus("Ran camera action " + actionName + " in " + state.selectedSceneKey, false);
  }

  async function outlineObject(objectPath) {
    rememberObjectListScroll();

    if (isObjectOutlined(state.selectedSceneKey, objectPath)) {
      state.outlinedSceneKey = null;
      state.outlinedObjectPath = null;
      renderObjectList();
      await window.PhaserBridge.clearHighlight();
      setStatus("Hid outline for " + objectPath, false);
      return;
    }

    state.outlinedSceneKey = state.selectedSceneKey;
    state.outlinedObjectPath = objectPath;
    renderObjectList();
    await syncPageHighlight();
    setStatus("Outlined object " + objectPath + " on the page", false);
  }

  function moveSelectionBy(delta) {
    var visiblePaths = getVisiblePaths();

    if (visiblePaths.length === 0) {
      return null;
    }

    if (!state.selectedObjectPath) {
      return visiblePaths[0];
    }

    var currentIndex = visiblePaths.indexOf(state.selectedObjectPath);

    if (currentIndex === -1) {
      return visiblePaths[0];
    }

    var nextIndex = Math.max(0, Math.min(visiblePaths.length - 1, currentIndex + delta));
    return visiblePaths[nextIndex];
  }

  async function handleTreeKeydown(event) {
    if (!state.selectedSceneKey || state.activeInspectorTab !== "displayObjects") {
      return;
    }

    if (event.target === elements.objectFilter || isEditableInspectorTarget(event.target)) {
      if (event.key === "Enter" && event.target.dataset && event.target.dataset.editKey) {
        event.preventDefault();
        await commitInspectorControlValue(event.target, { preserveFocus: true });
      }

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        event.target &&
        event.target.type === "number" &&
        event.target.dataset &&
        event.target.dataset.editKey
      ) {
        var control = event.target;

        window.setTimeout(function () {
          commitInspectorControlValue(control, { preserveFocus: true }).catch(function (error) {
            setStatus(error.message || "Failed to update object property", true);
          });
        }, 0);
      }

      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(event.key) === -1) {
      return;
    }

    event.preventDefault();

    if (event.key === "ArrowDown") {
      var nextDown = moveSelectionBy(1);

      if (nextDown) {
        await selectObject(nextDown);
      }

      return;
    }

    if (event.key === "ArrowUp") {
      var nextUp = moveSelectionBy(-1);

      if (nextUp) {
        await selectObject(nextUp);
      }

      return;
    }

    if (!state.selectedObjectPath) {
      return;
    }

    var selectedObject = getObjectByPath(state.selectedObjectPath);

    if (!selectedObject) {
      return;
    }

    if (event.key === "ArrowRight") {
      if (selectedObject.childCount > 0 && !state.expandedPaths[selectedObject.path]) {
        state.expandedPaths[selectedObject.path] = true;
        renderObjectList();
        return;
      }

      var firstChildPath = getFirstChildPath(selectedObject.path);

      if (firstChildPath) {
        await selectObject(firstChildPath);
      }

      return;
    }

    if (event.key === "ArrowLeft") {
      if (selectedObject.childCount > 0 && state.expandedPaths[selectedObject.path]) {
        state.expandedPaths[selectedObject.path] = false;
        renderObjectList();
        return;
      }

      var parentPath = getParentPath(selectedObject.path);

      if (parentPath) {
        await selectObject(parentPath);
      }
    }
  }

  async function handleSceneClick(event) {
    var row = event.target.closest("[data-scene-key]");

    if (!row) {
      return;
    }

    var sceneKey = row.dataset.sceneKey;

    if (!sceneKey || sceneKey === state.selectedSceneKey) {
      return;
    }

    state.selectedSceneKey = sceneKey;
    state.selectedObjectPath = null;
    state.outlinedSceneKey = null;
    state.outlinedObjectPath = null;
    state.objectDetails = null;
    state.expandedPaths = {};
    syncSceneInspectorFromSnapshot();
    renderSceneList();
    renderSceneInspectorPanels();
    renderObjectList();

    if (state.activeInspectorTab === "displayObjects") {
      elements.objectList.focus();
    }

    setStatus("Loading scene " + sceneKey + "...", false);

    try {
      await window.PhaserBridge.clearHighlight();
      await loadSelectedSceneObjects();
      await loadSelectedSceneInspector();
      setStatus("Loaded " + state.sceneObjects.length + " objects from " + sceneKey, false);
    } catch (error) {
      setStatus(error.message || "Failed to load scene objects", true);
    }
  }

  async function handleObjectClick(event) {
    var breadcrumbButton = event.target.closest("[data-breadcrumb-path]");

    if (breadcrumbButton) {
      var breadcrumbPath = breadcrumbButton.dataset.breadcrumbPath;

      if (breadcrumbPath) {
        await selectObject(breadcrumbPath);
      }

      return;
    }

    var toggleButton = event.target.closest("[data-toggle-path]");

    if (toggleButton) {
      var togglePath = toggleButton.dataset.togglePath;

      if (!togglePath || toggleButton.disabled) {
        return;
      }

      state.expandedPaths[togglePath] = !state.expandedPaths[togglePath];
      renderObjectList();
      return;
    }

    var actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      var actionPath = actionButton.dataset.objectPath;
      var actionName = actionButton.dataset.action;

      if (!actionPath || !actionName) {
        return;
      }

      try {
        if (actionName === "info") {
          await toggleObjectSelection(actionPath);
          return;
        }

        if (actionName === "outline") {
          await outlineObject(actionPath);
          return;
        }

        if (actionName === "visibility") {
          await changeObjectVisibility(actionPath);
          return;
        }

        if (actionName === "copyPath") {
          var breadcrumbTrail = formatBreadcrumbTrail(actionPath);
          var copiedPath = await copyTextToClipboard(breadcrumbTrail);
          setStatus(copiedPath ? "Copied breadcrumb path" : "Failed to copy breadcrumb path", !copiedPath);
          return;
        }

        if (actionName === "copySettingField") {
          var fieldLabel = actionButton.dataset.copyLabel || "Value";
          var copySource = actionButton.dataset.copySource || "";
          var fieldValue = "";

          if (copySource === "editable") {
            fieldValue = getCurrentEditableValueText(actionPath, actionButton.dataset.copyProperty);
          } else {
            fieldValue = actionButton.dataset.copyValue || "";
          }

          var copiedField = await copyTextToClipboard(buildSettingCopyLine(fieldLabel, fieldValue));
          setStatus(
            copiedField ? "Copied " + fieldLabel + " value" : "Failed to copy " + fieldLabel + " value",
            !copiedField
          );
          return;
        }

        if (actionName === "reset") {
          await resetObjectEdits(actionPath);
        }
      } catch (error) {
        setStatus(error.message || "Failed to update object", true);
      }
    }
  }

  async function handleInspectorControlChange(event) {
    var control = event.target.closest("[data-edit-key]");

    if (!control) {
      return;
    }

    try {
      await commitInspectorControlValue(control, { preserveFocus: true });
    } catch (error) {
      setStatus(error.message || "Failed to update object property", true);
    }
  }

  async function handleCameraControlChange(event) {
    var control = event.target.closest("[data-camera-property]");

    if (!control) {
      return;
    }

    try {
      await updateSceneCameraPropertyFromControl(control);
    } catch (error) {
      setStatus(error.message || "Failed to update camera property", true);
    }
  }

  async function togglePickMode() {
    var enable = !state.pickModeEnabled;

    try {
      var result = await window.PhaserBridge.setPickMode(null, enable);
      state.pickModeEnabled = !!result.pickModeEnabled;
      renderToolbarButtons();
      setStatus(
        state.pickModeEnabled ? "Click an object in the page to inspect it" : "Pick mode cancelled",
        false
      );
    } catch (error) {
      setStatus(error.message || "Failed to change pick mode", true);
    }
  }

  async function pollPickedSelection() {
    try {
      var result = await window.PhaserBridge.consumePickedObject();

      state.pickModeEnabled = !!result.pickModeEnabled;
      renderToolbarButtons();

      if (!result.selection || !result.selection.sceneKey || !result.selection.objectPath) {
        return;
      }

      await applySelectedObject(
        result.selection.sceneKey,
        result.selection.objectPath,
        "Selected object from page"
      );
    } catch (error) {
      // Polling failures should not disrupt the panel UI.
    }
  }

  async function pollSceneInspector() {
    if (
      document.hidden ||
      !state.snapshot ||
      !state.snapshot.detected ||
      !state.selectedSceneKey ||
      isEditingCameraControl()
    ) {
      return;
    }

    try {
      await loadSelectedSceneInspector();
    } catch (error) {
      // Keep polling silent during runtime changes.
    }
  }

  function maybeAutoRefresh() {
    if (Date.now() - state.lastRefreshAt < AUTO_REFRESH_COOLDOWN_MS) {
      return;
    }

    refreshData({ preserveSelection: true });
  }

  function handleInspectorTabClick(event) {
    var button = event.target.closest("[data-inspector-tab]");

    if (!button) {
      return;
    }

    var nextTab = button.dataset.inspectorTab;

    if (!nextTab || nextTab === state.activeInspectorTab) {
      return;
    }

    state.activeInspectorTab = nextTab;
    renderSceneInspectorPanels();

    if (nextTab === "displayObjects" && state.selectedSceneKey) {
      elements.objectList.focus();
    } else if (state.selectedSceneKey) {
      loadSelectedSceneInspector().catch(function () {
        // Passive refresh only.
      });
    }
  }

  function handleSceneActionClick(event) {
    var button = event.target.closest("[data-scene-action]");

    if (!button || button.disabled) {
      return;
    }

    performSceneAction(button.dataset.sceneAction).catch(function (error) {
      setStatus(error.message || "Failed to change scene state", true);
    });
  }

  function handleCameraActionClick(event) {
    var button = event.target.closest("[data-camera-action]");

    if (!button || button.disabled) {
      return;
    }

    performCameraAction(button.dataset.cameraAction).catch(function (error) {
      setStatus(error.message || "Failed to run camera action", true);
    });
  }

  function handleCameraPanelKeydown(event) {
    var control = event.target.closest("[data-camera-property]");

    if (!control) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      updateSceneCameraPropertyFromControl(control).catch(function (error) {
        setStatus(error.message || "Failed to update camera property", true);
      });
      return;
    }

    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      control.type === "number"
    ) {
      window.setTimeout(function () {
        updateSceneCameraPropertyFromControl(control).catch(function (error) {
          setStatus(error.message || "Failed to update camera property", true);
        });
      }, 0);
    }
  }

  function bindEvents() {
    elements.refreshButton.addEventListener("click", function () {
      refreshData({ preserveSelection: true });
    });

    elements.resetAllButton.addEventListener("click", function () {
      resetAllObjectEdits().catch(function (error) {
        setStatus(error.message || "Failed to reset changed values", true);
        renderToolbarButtons();
      });
    });

    elements.gameInfoToggle.addEventListener("click", function () {
      state.gameInfoExpanded = !state.gameInfoExpanded;
      renderGameInfoVisibility();
    });

    elements.pickButton.addEventListener("click", togglePickMode);
    elements.sceneList.addEventListener("click", handleSceneClick);
    elements.inspectorTabs.addEventListener("click", handleInspectorTabClick);
    elements.objectList.addEventListener("click", handleObjectClick);
    elements.objectList.addEventListener("change", handleInspectorControlChange);
    elements.objectList.addEventListener("keydown", function (event) {
      handleTreeKeydown(event);
    });
    elements.breadcrumbs.addEventListener("click", handleObjectClick);
    elements.statePanelContent.addEventListener("click", handleSceneActionClick);
    elements.cameraPanelContent.addEventListener("click", handleCameraActionClick);
    elements.cameraPanelContent.addEventListener("change", function (event) {
      handleCameraControlChange(event);
    });
    elements.cameraPanelContent.addEventListener("keydown", handleCameraPanelKeydown);
    elements.objectFilter.addEventListener("input", function (event) {
      state.filterQuery = event.target.value || "";

      if (state.selectedObjectPath) {
        ensureExpandedAncestors(state.selectedObjectPath);
      }

      renderObjectList();
    });

    window.addEventListener("focus", maybeAutoRefresh);
    window.addEventListener("pageshow", maybeAutoRefresh);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        maybeAutoRefresh();
      }
    });

    window.setInterval(pollPickedSelection, PICK_POLL_INTERVAL_MS);
    window.setInterval(pollSceneInspector, SCENE_TELEMETRY_POLL_INTERVAL_MS);
  }

  function initialize() {
    cacheElements();
    bindEvents();
    clearGameInfo();
    renderAll();
    refreshData({ preserveSelection: false });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
