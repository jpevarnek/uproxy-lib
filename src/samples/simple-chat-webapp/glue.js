function loadModule() {
  return freedom('uproxy-lib/simple-chat/freedom-module.json', {
    'logger': 'uproxy-lib/loggingprovider/freedom-module.json',
    'debug': 'debug'
  }).then(function(moduleFactory) {
    return moduleFactory();
  });
}
