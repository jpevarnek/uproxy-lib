TaskManager = require './tools/taskmanager'
Rule = require './tools/common-grunt-rules'

path = require 'path'

module.exports = (grunt) ->
  #-------------------------------------------------------------------------
  grunt.initConfig
    pkg: grunt.file.readJSON 'package.json'

    # TODO: This must be factored out into common-grunt-rules.
    symlink:
      # Symlink each source file under src/ under build/.
      build:
        files: [
          expand: true
          cwd: 'src/'
          src: ['**/*']
          filter: 'isFile'
          dest: 'build/'
        ]
      # Symlink each directory under third_party/ under build/third_party/.
      thirdParty:
        files: [
          expand: true,
          cwd: 'third_party/'
          src: ['*']
          filter: 'isDirectory'
          dest: 'build/third_party/'
        ]
      # Symlink the Chrome and Firefox builds of Freedom under build/freedom/.
      freedom:
        files: [ {
          expand: true
          cwd: path.dirname(require.resolve('freedom-for-chrome/Gruntfile'))
          src: ['freedom-for-chrome.js']
          dest: 'build/freedom/'
        }, {
          expand: true
          cwd: path.dirname(require.resolve('freedom-for-firefox/Gruntfile'))
          src: ['freedom-for-firefox.jsm']
          dest: 'build/freedom/'
        } ]
      #require.resolve 'freedom-for-firefox/freedom-for-firefox.jsm'

    copy:
      crypto: Rule.copyModule 'crypto'
      taskmanager: Rule.copyModule 'taskmanager'
      arraybuffers: Rule.copyModule 'arraybuffers'
      handler: Rule.copyModule 'handler'
      logging: Rule.copyModule 'logging'
      webrtc: Rule.copyModule 'webrtc'

      freedomTypings: Rule.copyModule 'freedom/typings'

      simpleWebrtcChat: Rule.copyModule 'samples/simple-webrtc-chat'
      simpleWebrtcChatLib: Rule.copySampleFiles 'samples/simple-webrtc-chat'

      simpleFreedomChat: Rule.copyModule 'samples/simple-freedom-chat'
      simpleFreedomChatLib: Rule.copySampleFiles 'samples/simple-freedom-chat'

      copypasteFreedomChat: Rule.copyModule 'samples/copypaste-freedom-chat'
      copypasteFreedomChatLib: Rule.copySampleFiles 'samples/copypaste-freedom-chat'

    ts:
      # For bootstrapping of this Gruntfile
      taskmanager: Rule.typescriptSrc 'taskmanager'
      taskmanagerSpecDecl: Rule.typescriptSpecDecl 'taskmanager'

      # The uProxy modules library
      crypto: Rule.typescriptSrc 'crypto'

      arraybuffers: Rule.typescriptSrc 'arraybuffers'
      arraybuffersSpecDecl: Rule.typescriptSpecDecl 'arraybuffers'

      handler: Rule.typescriptSrc 'handler'
      handlerSpecDecl: Rule.typescriptSpecDecl 'handler'

      logging: Rule.typescriptSrc 'logging'
      loggingSpecDecl: Rule.typescriptSpecDecl 'logging'

      webrtc: Rule.typescriptSrc 'webrtc'

      # freedom/typings only contains specs and declarations.
      freedomTypingsSpecDecl: Rule.typescriptSpecDecl 'freedom/typings'

      simpleWebrtcChat: Rule.typescriptSrc 'samples/simple-webrtc-chat'
      simpleFreedomChat: Rule.typescriptSrc 'samples/simple-freedom-chat'
      copypasteFreedomChat: Rule.typescriptSrc 'samples/copypaste-freedom-chat'

    jasmine:
      handler: Rule.jasmineSpec 'handler'
      taskmanager: Rule.jasmineSpec 'taskmanager'
      arraybuffers: Rule.jasmineSpec 'arraybuffers'
      logging: Rule.jasmineSpec 'logging'

    clean: ['build/', 'dist/', '.tscache/']

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-contrib-symlink'
  grunt.loadNpmTasks 'grunt-contrib-uglify'
  grunt.loadNpmTasks 'grunt-ts'

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'base', [
    'symlink:build'
    'symlink:thirdParty'
  ]

  taskManager.add 'taskmanager', [
    'base'
    'ts:taskmanager'
    'ts:taskmanagerSpecDecl'
    'copy:taskmanager'
  ]

  taskManager.add 'crypto', [
    'base'
    'ts:crypto'
    'copy:crypto'
  ]

  taskManager.add 'arraybuffers', [
    'base'
    'ts:arraybuffers'
    'ts:arraybuffersSpecDecl'
    'copy:arraybuffers'
  ]

  taskManager.add 'handler', [
    'base'
    'ts:handler'
    'ts:handlerSpecDecl'
    'copy:handler'
  ]

  taskManager.add 'logging', [
    'base'
    'ts:logging'
    'ts:loggingSpecDecl'
    'copy:logging'
  ]

  taskManager.add 'webrtc', [
    'logging'
    'crypto'
    'handler'
    'base'
    'ts:webrtc'
    'copy:webrtc'
  ]

  taskManager.add 'freedom', [
    'base'
    'symlink:freedom'
    'ts:freedomTypingsSpecDecl'
  ]

  taskManager.add 'simpleWebrtcChat', [
    'base'
    'webrtc'
    'ts:simpleWebrtcChat'
    'copy:simpleWebrtcChat'
    'copy:simpleWebrtcChatLib'
  ]

  taskManager.add 'simpleFreedomChat', [
    'base'
    'logging'
    'freedom'
    'ts:simpleFreedomChat'
    'copy:simpleFreedomChat'
    'copy:simpleFreedomChatLib'
  ]

  taskManager.add 'copypasteFreedomChat', [
    'base'
    'logging'
    'freedom'
    'ts:copypasteFreedomChat'
    'copy:copypasteFreedomChat'
    'copy:copypasteFreedomChatLib'
  ]

  taskManager.add 'samples', [
    'simpleWebrtcChat'
    'simpleFreedomChat'
    'copypasteFreedomChat'
  ]

  taskManager.add 'build', [
    'arraybuffers'
    'taskmanager'
    'handler'
    'logging'
    'crypto'
    'webrtc'
    'freedom'
    'samples'
  ]

  taskManager.add 'test', [
    'build', 'jasmine'
  ]

  grunt.registerTask 'default', [
    'build'
  ]

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
