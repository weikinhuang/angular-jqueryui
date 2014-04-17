/**
 * Chrome.Dialog is a service to quickly create AngularJS-powered modal windows
 * with jquery.ui dialog. Creating custom modals is straightforward: create a
 * partial view, its controller and reference them when using the service.
 *
 * This service has only one method: open(options) where available options are
 * like follows:
 *
 * @param {Function} templateUrl - a path to a template representing modal's
 *            content
 *
 * @param {Function} template - inline template representing the modal's content
 *
 * @param {Function} scope - a scope instance to be used for the modal's content
 *            (actually the $modal service is going to create a child scope of a
 *            provided scope). Defaults to $rootScope
 *
 * @param {Function} controller - a controller for a modal instance - it can
 *            initialize scope used by modal. A controller can be injected with
 *            $modalInstance
 *
 * @param {Function} resolve - members that will be resolved and passed to the
 *            controller as locals; it is equivalent of the resolve property for
 *            AngularJS routes
 *
 * @param {Object} locals - members that will be attached to the local controller's
 *            scope
 *
 * @param {Object} dialogOpts - jquery ui dialog options
 * @see http://api.jqueryui.com/dialog/
 *
 * The open method returns a modal instance, an object with the following
 * properties:
 *
 * @param {Function} close(result) - a method that can be used to close a modal,
 *            passing a result
 *
 * @param {Function} result - a promise that is resolved when a modal is closed
 *            and rejected when a modal is dismissed
 *
 * @param {Function} opened - a promise that is resolved when a modal gets
 *            opened after downloading content's template and resolving all
 *            variables
 *
 * @param {Function} moveToTop - a method that focuses the modal by bringing it
 *            to the forefront
 *
 * In addition the scope associated with modal's content is augmented with 2
 * methods:
 *
 * @param {Function} $close(result)
 *
 * @param {Function} $dismiss(reason) Those methods make it easy to close a
 *            modal window without a need to create a dedicated controller
 *
 * @param {Object} $dialogOpts Watched collection that changes the dialog
 * @see http://api.jqueryui.com/dialog/
 */
Classify("Td.Service/Chrome.Dialog", {
	$inject : [ "$http", "$q", "$rootScope", "$compile", "$controller", "$templateCache", "$injector" ],
	dialogEvents : [
		"beforeClose",
		"create",
		"drag",
		"dragStart",
		"dragStop",
		"focus",
		"resize",
		"resizeStart",
		"resizeStop"
	],
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

			// add locals to scope
			angular.forEach(options.locals || {}, function(value, key) {
				modalScope[key] = value;
			});
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
				};
			});

			$dialog = modalDomEl.dialog(dialogOpts);

			modalScope.$watchCollection("$dialogOpts", function(newOpts) {
				$dialog.dialog("option", newOpts);
			});
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
