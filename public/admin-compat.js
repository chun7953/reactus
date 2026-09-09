(function () {
  'use strict';

  var FALLBACK_MS = 12500;
  var legacyBundleStarted = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function isVisible(node) {
    return !!node && !node.classList.contains('hidden');
  }

  function resolved() {
    return isVisible(byId('app')) || isVisible(byId('loginRequired'));
  }

  function showFailure(message) {
    if (resolved()) return;
    var shell = byId('startupShell');
    var title = byId('startupShellTitle');
    var text = byId('startupShellMessage');
    var retry = byId('startupShellRetry');
    var identity = byId('identity');
    if (shell) shell.classList.remove('hidden');
    if (title) title.textContent = '管理画面を読み込めませんでした';
    if (text) text.textContent = message || '初期情報の取得が完了していません。待ち続けず、再試行してください。';
    if (retry) retry.classList.remove('hidden');
    if (identity) identity.textContent = '読み込みに失敗しました';
  }

  function modernSyntaxSupported() {
    try {
      return Function('var x={a:{b:1}}; return x?.a?.b ?? 0;')() === 1;
    } catch (error) {
      return false;
    }
  }

  function loadLegacyBundle() {
    if (legacyBundleStarted) return;
    legacyBundleStarted = true;
    window.__reactusLegacyAdmin = true;

    var modules = document.querySelectorAll('script[type="module"]');
    for (var i = 0; i < modules.length; i += 1) {
      if (modules[i].parentNode) modules[i].parentNode.removeChild(modules[i]);
    }

    var script = document.createElement('script');
    script.src = '/admin.bundle.js' + (window.__reactusAdminAssetQuery || '');
    script.async = false;
    script.onerror = function () {
      showFailure('この端末向けの管理画面を読み込めませんでした。再試行してください。');
    };
    document.body.appendChild(script);
  }

  function install() {
    var retry = byId('startupShellRetry');
    if (retry) {
      retry.onclick = function () {
        window.location.reload();
      };
    }

    window.setTimeout(function () {
      showFailure();
    }, FALLBACK_MS);

    if (!modernSyntaxSupported()) {
      var message = byId('startupShellMessage');
      if (message) message.textContent = 'この端末向けの互換表示を読み込んでいます。';
      loadLegacyBundle();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
