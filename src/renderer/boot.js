const minUrl = new URL('../../node_modules/monaco-editor/min/', window.location.href).href;

window.MonacoEnvironment = {
  getWorkerUrl() {
    const code = `self.MonacoEnvironment={baseUrl:${JSON.stringify(minUrl)}};importScripts(${JSON.stringify(`${minUrl}vs/base/worker/workerMain.js`)});`;
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  },
};

require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });

require(['vs/editor/editor.main'], () => {
  import('./app.js')
    .then((mod) => mod.start())
    .catch((error) => {
      const splash = document.getElementById('splash');
      const text = String(error && error.stack || error);
      if (splash) {
        splash.hidden = false;
        splash.innerHTML = `<pre class="splash-error">${text}</pre>`;
      }
      if (window.studio) window.studio.smokeFail(text);
    });
});
