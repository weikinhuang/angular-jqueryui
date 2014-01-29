Classify("Td.Service/Chrome.Dialog", {
	$inject : [ "$http", "$q", "$rootScope", "$compile", "$controller", "$templateCache", "$injector" ],
	dialogEvents : [ "beforeClose",
		"create",
		"drag",
		"dragStart",
		"dragStop",
		"focus",
		"resize",
		"resizeStart",
		"resizeStop" ],
	open : function(options) {
		var self = this,
			modalResultDeferred = this.$q.defer(),
			modalOpenedDeferred = this.$q.defer(),
			$dialog = null,
			templateAndResolvePromise, modalInstance;

		options = angular.extend({}, options);
		options.dialogOpts = options.dialogOpts || {};

		if (!options.template && !options.templateUrl) {
			throw new Error("One of template or templateUrl options is required.");
		}

		// prepare an instance of a modal to be injected into controllers and
		// returned to a caller
		modalInstance = {
			result : modalResultDeferred.promise,
			opened : modalOpenedDeferred.promise,
			close : function(result) {
				modalResultDeferred.resolve(result);
				if ($dialog) {
					$dialog.dialog("close");
				}
			},
			moveToTop : function() {
				if ($dialog) {
					$dialog.dialog("moveToTop");
				}
			}
		};

		templateAndResolvePromise = [ this._getTemplatePromise(options) ].concat(this._getResolvePromises(options.resolve || {}));
		this.$q.all(templateAndResolvePromise).then(function(tplAndVars) {
			var modalScope = (options.scope || self.$rootScope).$new(),
				ctrlLocals = {},
				resolveIter = 1,
				dialogOpts, modalDomEl;
			// close method
			modalScope.$close = modalInstance.close;
			modalScope.$dialogOpts = options.dialogOpts;

			dialogOpts = {
				open : function(e, ui) {
					modalOpenedDeferred.resolve(true);
				},
				close : function(e, ui) {
					modalResultDeferred.resolve();
					modalScope.$destroy();
				}
			};

			// controllers
			if (options.controller) {
				ctrlLocals.$scope = modalScope;
				angular.forEach(options.resolve, function(value, key) {
					ctrlLocals[key] = tplAndVars[resolveIter++];
				});
				self.$controller(options.controller, ctrlLocals);
			}

			modalDomEl = self.$compile(angular.element("<div>").html(tplAndVars[0]))(modalScope);

			angular.forEach(self.dialogEvents, function(event) {
				dialogOpts[event] = function(e, ui) {
					modalScope.$eval(event, {
						$event : e,
						$ui : ui
					});
					if (!modalScope.$$phase) {
						modalScope.$digest();
					}
				};
			});

			$dialog = modalDomEl.dialog(dialogOpts);

			modalScope.$watchCollection("$dialogOpts", function(newOpts) {
				$dialog.dialog("option", newOpts);
			});

			// render if not rendered
			if (!modalScope.$$phase) {
				modalScope.$digest();
			}
		}, function resolveError(reason) {
			modalOpenedDeferred.reject(false);
			modalResultDeferred.reject(reason);
		});

		return modalInstance;
	},
	_getTemplatePromise : function(options) {
		return options.template ? this.$q.when(options.template) : this.$http.get(options.templateUrl, {
			cache : this.$templateCache
		}).then(function(result) {
			return result.data;
		});
	},
	_getResolvePromises : function(resolves) {
		var promisesArr = [], self = this;
		angular.forEach(resolves, function(value, key) {
			if (angular.isFunction(value) || angular.isArray(value)) {
				promisesArr.push(self.$q.when(self.$injector.invoke(value)));
			}
		});
		return promisesArr;
	}
});
