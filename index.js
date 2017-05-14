function createDependentMethod(lib) {
  'use strict';
  var q = lib.q;

  function InvokerWaiter(instance, multis, args, invoker) {
    this.instance = instance;
    this.args = args;
    this.invoker = invoker;
    this.satisfaction = lib.ListenableMap.multiListenForMulti(multis, this.onOK.bind(this));
    this.satisfaction.trigger();
  }
  InvokerWaiter.prototype.destroy = function () {
    if (this.satisfaction) {
      this.satisfaction.destroy();
    }
    this.satisfaction = null;
    this.invoker = null;
    this.args = null;
    this.instance = null;
  };
  InvokerWaiter.prototype.onOK = function (all) {
    if (!this.invoker) {
      return;
    }
    this.invoker.apply(this.instance,all.concat(this.args));
    this.destroy();
  };

  function superinvoker(func) {
    return function () {
      var ret = func.apply(this, arguments);
      if (!q.isPromise(ret)) {
        return q.reject(new lib.Error('PARAMETERS_LENGTH_MISMATCH'));
      }
      return ret;
    }
  }

  function mapFetcher(name) {
    var names = name.split('.'), mapobj = {ctx: this, map: null}, ret;
    names.forEach(function(n){
      if (mapobj.ctx) {
        mapobj.map = mapobj.ctx[n];
        mapobj.ctx = mapobj.map;
      }
    });
    ret = mapobj.map;
    mapobj.ctx = null;
    mapobj.map = null;
    mapobj = null;
    return ret;
  }

  function resolvedMulti(sm) {
    return {map: mapFetcher.call(this, sm.mapname), names: sm.names.slice()};
  }

  function resolvemaps(symbolicmultis){
    return symbolicmultis.map(resolvedMulti.bind(this));
  }

  function nameslength(result, multi) {
    return result + multi.names.length;
  }

  function dependentMethod (symbolicmultis, func) {
    var multinameslen = symbolicmultis.reduce(nameslength,0),
      outerparamcount = func.length-multinameslen;
    if (outerparamcount<1) {
      throw new lib.Error('INVALID_PARAMETER_LIST_FOR_INNER_FUNC','Number of formal input parameters for the real handler must be larger of number of items in the subservice names array by at least one');
    }
    function invoker () {
      var args = Array.prototype.slice.call(arguments),
        multis = resolvemaps.call(this,symbolicmultis),
        defer;
      if (args.length < outerparamcount) {
        if (args.length < outerparamcount-1) {
          console.error(args, 'are too short, should be', outerparamcount-1, 'at least');
          throw new lib.Error('NUMBER_OF_INPUT_PARAMS_TOO_LOW');
        }
        defer = q.defer();
        args.push(defer);
      }
      if (args.length > outerparamcount) {
        console.error(args, 'are too long, should be', outerparamcount, 'at most');
        throw new lib.Error('NUMBER_OF_INPUT_PARAMS_TOO_HIGH');
      }
      new InvokerWaiter(this, multis, args, func);
      return args[args.length-1].promise;
    }
    return superinvoker(invoker);
  };

  return dependentMethod;
}

module.exports = createDependentMethod;
