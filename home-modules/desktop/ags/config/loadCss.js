const scss = `${App.configDir}/scss/main.scss`;
const css = '/tmp/ags-style.css';
Utils.exec(`sass ${scss} ${css}`);

App.resetCss();
App.applyCss(css);
