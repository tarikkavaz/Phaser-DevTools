(function () {
  var AUTO_REFRESH_COOLDOWN_MS = 1200;
  var PICK_POLL_INTERVAL_MS = 500;

  var state = {
    snapshot: null,
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
    pickModeEnabled: false,
    gameInfoExpanded: false,
    pendingInspectorFocus: null,
    pendingObjectListScrollTop: null
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
    elements.gameInfoToggle = document.getElementById("game-info-toggle");
    elements.gameInfoCard = document.getElementById("game-info-card");
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

  async function commitInspectorControlValue(control, options) {
    if (!control || !control.dataset) {
      return;
    }

    if (options && options.preserveFocus) {
      rememberInspectorFocus(control.dataset.objectPath, control.dataset.editKey);
    }

    await updateObjectProperty(
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
    mainButton.addEventListener("click", function () {
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

    visibleObjects.forEach(function (displayObject, index) {
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
      mainButton.appendChild(name);
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
    renderObjectList();
    renderToolbarButtons();
  }

  function queueRefresh() {
    state.refreshQueued = true;
  }

  async function syncPageHighlight() {
    if (!state.outlinedSceneKey || !state.outlinedObjectPath) {
      await window.PhaserBridge.clearHighlight();
      return;
    }

    await window.PhaserBridge.highlightObject(state.outlinedSceneKey, state.outlinedObjectPath);
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
        state.outlinedSceneKey = null;
        state.outlinedObjectPath = null;
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
    state.outlinedSceneKey = sceneKey;
    state.outlinedObjectPath = objectPath;
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
    state.outlinedSceneKey = state.selectedSceneKey;
    state.outlinedObjectPath = objectPath;
    ensureExpandedAncestors(objectPath);
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

  function isEditableInspectorTarget(target) {
    return !!(target && target.closest(".inline-inspector-control"));
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
    if (!state.selectedSceneKey) {
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
        }
      } catch (error) {
        setStatus(error.message || "Failed to update object", true);
      }

      return;
    }

    return;
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

    elements.gameInfoToggle.addEventListener("click", function () {
      state.gameInfoExpanded = !state.gameInfoExpanded;
      renderGameInfoVisibility();
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
