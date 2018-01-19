'use strict';

const debugLog = require('./debugLog');

function runPythonHandler(funOptions, options) {
  const spawn = require('child_process').spawn;
  
  return function (event, context) {
    const process = spawn('sls', ['invoke', 'local', '-f', funOptions.funName], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      cwd: funOptions.servicePath,
    });
    process.stdin.write(`${JSON.stringify(event)}\n`);
    process.stdin.end();
    let results = '';
    process.stdout.on('data', data => {
      results += data;
    });
    process.stderr.on('data', data => {
      context.fail(data);
    });
    process.on('close', code => {
      if (code == 0) {
        try {
          const resultMatch = results.match(/^{(.|\n)*?}$/gm);
          const resultJson = resultMatch.pop();
          console.log(resultMatch.join(''));
          context.succeed(JSON.parse(resultJson));
        }
        catch (ex) {
          context.fail(results);
        }
      }
      else {
        context.succeed(code, results);
      }
    });
  };
}

module.exports = {
  getFunctionOptions(fun, funName, servicePath, serviceRuntime) {
    console.log(fun, funName, servicePath);
    // Split handler into method name and path i.e. handler.run
    const handlerFile = fun.handler.split('.')[0];
    const handlerName = fun.handler
      .split('/')
      .pop()
      .split('.')[1];

    return {
      funName,
      handlerName, // i.e. run
      handlerFile,
      handlerPath: `${servicePath}/${handlerFile}`,
      servicePath,
      funTimeout: (fun.timeout || 30) * 1000,
      babelOptions: ((fun.custom || {}).runtime || {}).babel,
      serviceRuntime,
    };
  },

  // Create a function handler
  // The function handler is used to simulate Lambda functions
  createHandler(funOptions, options) {
    if (!options.skipCacheInvalidation) {
      debugLog('Invalidating cache...');

      for (const key in require.cache) {
        // Require cache invalidation, brutal and fragile.
        // Might cause errors, if so please submit an issue.
        if (!key.match('node_modules')) delete require.cache[key];
      }
    }
    const user_python = true;
    let handler = null;
    if (
      ['python2.7', 'python3.6'].indexOf(funOptions.serviceRuntime) !== -1
    ) {
      handler = runPythonHandler(funOptions, options);
    }
    else {
      debugLog(`Loading handler... (${funOptions.handlerPath})`);
      handler = require(funOptions.handlerPath)[funOptions.handlerName];
    }
    if (typeof handler !== 'function') {
      throw new Error(
        `Serverless-offline: handler for '${
          funOptions.funName
        }' is not a function`
      );
    }

    return handler;
  },
};
