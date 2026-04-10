(function () {
  var AUTO_REFRESH_COOLDOWN_MS = 1200;
  var PICK_POLL_INTERVAL_MS = 500;

  var state = {
    snapshot: null,
    sceneObjects: [],
    objectDetails: null,
    selectedSceneKey: null,
    selectedObjectPath: null,
    expandedPaths: {},
    filterQuery: "",
    isRefreshing: false,
    refreshQueued: false,
    lastRefreshAt: 0,
    sceneRequestId: 0,
    inspectorRequestId: 0,
    pickModeEnabled: false
  };

  var elements = {};

  function cacheElements() {
    elements.status = document.getElementById("status");
    elements.refreshButton = document.getElementById("refresh-button");
    elements.pickButton = document.getElementById("pick-button");
    elements.emptyState = document.getElementById("empty-state");
    elements.content = document.getElementById("content");
    elements.gameDetected = document.getElementById("game-detected");
    elements.gameWidth = document.getElementById("game-width");
    elements.gameHeight = document.getElementById("game-height");
    elements.gameRenderer = document.getElementById("game-renderer");
    elements.sceneCount = document.getElementById("scene-count");
    elements.sceneList = document.getElementById("scene-list");
    elements.objectList = document.getElementById("object-list");
    elements.objectListTitle = document.getElementById("object-list-title");
    elements.objectFilter = document.getElementById("object-filter");
    elements.breadcrumbs = document.getElementById("breadcrumbs");
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

  function formatNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }

    return String(Math.round(value * 100) / 100);
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

  function createPill(text) {
    var pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = text;
    return pill;
  }

  function getBranchHue(depth) {
    var hues = [112, 148, 184, 224, 268, 318, 42];
    return hues[depth % hues.length];
  }

  function renderToolbarButtons() {
    elements.pickButton.textContent = state.pickModeEnabled ? "Cancel pick" : "Pick on page";
  }

  function clearGameInfo() {
    elements.gameDetected.textContent = "-";
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

    elements.gameDetected.textContent = state.snapshot.detected ? "Yes" : "No";
    elements.gameWidth.textContent = formatNumber(game.width);
    elements.gameHeight.textContent = formatNumber(game.height);
    elements.gameRenderer.textContent = formatValue(game.rendererType);
    elements.sceneCount.textContent = formatValue(game.sceneCount);
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

  function isAncestorPath(ancestorPath, targetPath) {
    if (!ancestorPath || !targetPath || ancestorPath === targetPath) {
      return false;
    }

    return targetPath.indexOf(ancestorPath + ".") === 0;
  }

  function isDescendantPath(descendantPath, targetPath) {
    if (!descendantPath || !targetPath || descendantPath === targetPath) {
      return false;
    }

    return descendantPath.indexOf(targetPath + ".") === 0;
  }

  function getObjectByPath(objectPath) {
    return (
      state.sceneObjects.find(function (displayObject) {
        return displayObject.path === objectPath;
      }) || null
    );
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
        "</span><span>Active: " +
        formatBoolean(scene.active) +
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
    var editableFields = [
      ["X", "x", objectDetails.x, "number", "0.1"],
      ["Y", "y", objectDetails.y, "number", "0.1"],
      ["Scale X", "scaleX", objectDetails.scaleX, "number", "0.1"],
      ["Scale Y", "scaleY", objectDetails.scaleY, "number", "0.1"],
      ["Alpha", "alpha", objectDetails.alpha, "number", "0.05"],
      ["Rotation", "rotation", objectDetails.rotation, "number", "0.05"],
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
      var item = document.createElement("label");
      item.className = "inline-inspector-item is-editable";

      var label = document.createElement("span");
      label.className = "inline-inspector-label";
      label.textContent = field[0];

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
      item.appendChild(label);
      item.appendChild(controlWrap);
      editableGroup.appendChild(item);
    });

    var readonlyGroup = document.createElement("div");
    readonlyGroup.className = "inline-inspector-group is-readonly";

    readonlyFields.forEach(function (field) {
      var item = document.createElement("div");
      item.className = "inline-inspector-item";

      var label = document.createElement("span");
      label.className = "inline-inspector-label";
      label.textContent = field[0];

      var value = document.createElement("span");
      value.className = "inline-inspector-value";
      value.textContent = formatValue(field[1]);

      item.appendChild(label);
      item.appendChild(value);
      readonlyGroup.appendChild(item);
    });

    inspector.appendChild(editableGroup);
    inspector.appendChild(readonlyGroup);
    row.appendChild(inspector);
  }

  function renderObjectList() {
    elements.objectList.innerHTML = "";

    if (!state.selectedSceneKey) {
      elements.objectListTitle.textContent = "Select a scene";
      elements.objectList.innerHTML = '<p class="placeholder">Pick a scene to inspect its object tree.</p>';
      renderBreadcrumbs();
      return;
    }

    var visibleObjects = getVisibleObjects();
    elements.objectListTitle.textContent =
      state.sceneObjects.length + " objects in " + state.selectedSceneKey;

    if (visibleObjects.length === 0) {
      elements.objectList.innerHTML = '<p class="placeholder">No matching objects found.</p>';
      renderBreadcrumbs();
      return;
    }

    var query = getFilterQuery();
    var contextMap = getFilterContextMap(query);
    var fragment = document.createDocumentFragment();

    visibleObjects.forEach(function (displayObject) {
      var row = document.createElement("div");
      row.className =
        "list-row tree-row" +
        (displayObject.path === state.selectedObjectPath ? " selected" : "") +
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

      var indent = document.createElement("span");
      indent.className = "tree-indent";
      indent.style.width = Math.max(0, (displayObject.depth || 0) - 1) * 4 + "px";

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

      var name = document.createElement("span");
      name.className = "tree-row-name";
      name.textContent = displayObject.name || displayObject.type || "Unnamed object";

      main.appendChild(indent);
      main.appendChild(toggle);
      main.appendChild(name);
      mainButton.appendChild(main);

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
        meta.appendChild(createPill("hidden"));
      }

      mainButton.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "tree-row-actions";

      var outlineButton = document.createElement("button");
      outlineButton.type = "button";
      outlineButton.className = "row-action-button";
      outlineButton.dataset.action = "outline";
      outlineButton.dataset.objectPath = displayObject.path;
      outlineButton.textContent = "Outline";

      var visibilityButton = document.createElement("button");
      visibilityButton.type = "button";
      visibilityButton.className = "row-action-button";
      visibilityButton.dataset.action = "visibility";
      visibilityButton.dataset.objectPath = displayObject.path;
      visibilityButton.textContent = displayObject.visible === false ? "Show" : "Hide";

      actions.appendChild(outlineButton);
      actions.appendChild(visibilityButton);

      header.appendChild(mainButton);
      header.appendChild(actions);
      row.appendChild(header);

      if (displayObject.path === state.selectedObjectPath) {
        renderInlineInspector(row, state.objectDetails);
      }

      fragment.appendChild(row);
    });

    elements.objectList.appendChild(fragment);
    renderBreadcrumbs();

    var selectedRow = elements.objectList.querySelector(
      '.tree-row[data-object-path="' + state.selectedObjectPath + '"]'
    );

    if (selectedRow) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  }

  function renderContentVisibility() {
    var detected = !!(state.snapshot && state.snapshot.detected);

    elements.emptyState.classList.toggle("hidden", detected);
    elements.content.classList.toggle("hidden", !detected);
  }

  function renderAll() {
    renderContentVisibility();
    renderGameInfo();
    renderSceneList();
    renderObjectList();
    renderToolbarButtons();
  }

  function queueRefresh() {
    state.refreshQueued = true;
  }

  async function syncPageHighlight() {
    if (!state.selectedSceneKey || !state.selectedObjectPath) {
      await window.PhaserBridge.clearHighlight();
      return;
    }

    await window.PhaserBridge.highlightObject(state.selectedSceneKey, state.selectedObjectPath);
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
      state.snapshot = await window.PhaserBridge.getGameSnapshot();
      state.pickModeEnabled = !!state.snapshot.pickModeEnabled;

      if (!state.snapshot.detected) {
        state.selectedSceneKey = null;
        state.selectedObjectPath = null;
        state.sceneObjects = [];
        state.objectDetails = null;
        renderAll();
        setStatus("No Phaser game detected on this page", false);
        return;
      }

      var scenes = state.snapshot.scenes || [];
      var sceneStillExists = scenes.some(function (scene) {
        return scene.key === state.selectedSceneKey;
      });

      if (!preserveSelection || !sceneStillExists) {
        state.selectedSceneKey = scenes.length > 0 ? scenes[0].key : null;
        state.selectedObjectPath = null;
        state.objectDetails = null;
        state.expandedPaths = {};
      }

      renderAll();
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
    ensureExpandedAncestors(objectPath);

    renderSceneList();
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
    await syncPageHighlight();
    setStatus(sourceLabel, false);
  }

  async function selectObject(objectPath) {
    if (!objectPath) {
      return;
    }

    state.selectedObjectPath = objectPath;
    ensureExpandedAncestors(objectPath);
    renderObjectList();
    elements.objectList.focus();
    setStatus("Loading object " + objectPath + "...", false);

    await loadSelectedObjectDetails();
    await syncPageHighlight();
    setStatus("Inspecting object " + objectPath, false);
  }

  async function changeObjectVisibility(objectPath) {
    var objectSummary = getObjectByPath(objectPath);

    if (!objectSummary) {
      return;
    }

    if (state.selectedObjectPath !== objectPath) {
      await selectObject(objectPath);
    }

    var nextVisible = objectSummary.visible === false;
    var details = await window.PhaserBridge.setObjectVisibility(
      state.selectedSceneKey,
      objectPath,
      nextVisible
    );

    state.objectDetails = details && details.object ? details : null;
    await loadSelectedSceneObjects();
    renderObjectList();
    await syncPageHighlight();
    setStatus((nextVisible ? "Showed " : "Hid ") + objectPath, false);
  }

  function isEditableInspectorTarget(target) {
    return !!(target && target.closest(".inline-inspector-control-wrap"));
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
    renderObjectList();
    await syncPageHighlight();
    setStatus("Updated " + property + " on " + objectPath, false);
  }

  async function outlineObject(objectPath) {
    if (state.selectedObjectPath !== objectPath) {
      await selectObject(objectPath);
    }

    await window.PhaserBridge.highlightObject(state.selectedSceneKey, objectPath);
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
    if (!state.selectedSceneKey) {
      return;
    }

    if (event.target === elements.objectFilter || isEditableInspectorTarget(event.target)) {
      if (event.key === "Enter" && event.target.dataset && event.target.dataset.editKey) {
        event.preventDefault();
        await updateObjectProperty(
          event.target.dataset.objectPath,
          event.target.dataset.editKey,
          event.target.type === "checkbox" ? event.target.checked : event.target.value,
          event.target.type
        );
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
    state.objectDetails = null;
    state.expandedPaths = {};
    renderSceneList();
    renderObjectList();
    elements.objectList.focus();
    setStatus("Loading scene " + sceneKey + "...", false);

    try {
      await window.PhaserBridge.clearHighlight();
      await loadSelectedSceneObjects();
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
        if (actionName === "outline") {
          await outlineObject(actionPath);
          return;
        }

        if (actionName === "visibility") {
          await changeObjectVisibility(actionPath);
        }
      } catch (error) {
        setStatus(error.message || "Failed to update object", true);
      }

      return;
    }

    var row = event.target.closest(".tree-row-select");

    if (!row) {
      return;
    }

    var objectPath = row.dataset.objectPath;

    if (!objectPath) {
      return;
    }

    try {
      await selectObject(objectPath);
    } catch (error) {
      setStatus(error.message || "Failed to load object details", true);
    }
  }

  async function handleInspectorControlChange(event) {
    var control = event.target.closest("[data-edit-key]");

    if (!control) {
      return;
    }

    try {
      await updateObjectProperty(
        control.dataset.objectPath,
        control.dataset.editKey,
        control.type === "checkbox" ? control.checked : control.value,
        control.type
      );
    } catch (error) {
      setStatus(error.message || "Failed to update object property", true);
    }
  }

  async function togglePickMode() {
    var enable = !state.pickModeEnabled;

    try {
      var result = await window.PhaserBridge.setPickMode(state.selectedSceneKey, enable);
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

  function maybeAutoRefresh() {
    if (Date.now() - state.lastRefreshAt < AUTO_REFRESH_COOLDOWN_MS) {
      return;
    }

    refreshData({ preserveSelection: true });
  }

  function bindEvents() {
    elements.refreshButton.addEventListener("click", function () {
      refreshData({ preserveSelection: true });
    });

    elements.pickButton.addEventListener("click", togglePickMode);
    elements.sceneList.addEventListener("click", handleSceneClick);
    elements.objectList.addEventListener("click", handleObjectClick);
    elements.objectList.addEventListener("change", handleInspectorControlChange);
    elements.objectList.addEventListener("keydown", function (event) {
      handleTreeKeydown(event);
    });
    elements.breadcrumbs.addEventListener("click", handleObjectClick);
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
