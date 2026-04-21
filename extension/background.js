/* global chrome */

chrome.commands.onCommand.addListener(function (command) {
  if (command !== "open-phaser-popup") {
    return;
  }

  chrome.windows
    .getLastFocused({ populate: false })
    .then(function (win) {
      if (!win || win.id === undefined) {
        return;
      }
      return chrome.action.openPopup({ windowId: win.id });
    })
    .catch(function () {
      /* openPopup may be unavailable or blocked in some contexts */
    });
});
