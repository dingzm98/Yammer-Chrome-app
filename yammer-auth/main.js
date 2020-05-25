chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html', 
    { "bounds": { "width": 1000, "height": 800 },
      "minWidth": 500,
      "minHeight":500,
      "resizable":false,
      "id": "index"
    });
});
