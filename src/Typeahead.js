/**
 * Typeahead is a AngularJS wrapper for the jquery ui autocomplete widget. This
 * directive can be used to quickly create elegant typeheads with any form text
 * input.
 *
 * It is very well integrated into the AngularJS as it uses subset of the select
 * directive syntax, which is very flexible.
 *
 * Also this directive works with promises and it means that you can retrieve
 * matches using the $http service with minimal effort.
 *
 * The typeahead directives provide several attributes:
 *
 * @param {ngModel} ng-model : Assignable angular expression to data-bind to
 *
 * @param {String} td-typeahead : Comprehension Angular expression (see
 *            select directive)
 * <pre>
 * label for value in sourceArray
 * select as label for value in sourceArray
 * </pre>
 *
 * The sourceArray expression can use a special $viewValue variable
 *            that corresponds to a value entered inside input by a user.
 *
 * @param {Boolean} td-typeahead-editable (Defaults: true) : Should it
 *            restrict model values to the ones selected from the popup only?
 *
 * @param {ngModel} td-typeahead-loading (Defaults: angular.noop) : Binding
 *            to a variable that indicates if matches are being retrieved
 *            asynchronously
 *
 * @param {String} td-typeahead-menu-class (Defaults: undefined) : Class to
 *            be added to the menu dropdown
 *
 * @param {Number} td-typeahead-min-length (Defaults: 1) : Minimal no of
 *            characters that needs to be entered before typeahead kicks-in
 *
 * @param {Function} td-typeahead-on-select (Defaults: null) : A callback
 *            executed when a match is selected.
 * <pre>
 * $event : the trigger event
 * $item : the selected item
 * $items : all selected items (only when multiple is true)
 * $label : selected item's label
 * $model : selected item's model
 * </pre>
 *
 * @param {Function} td-typeahead-trigger (Defaults: null) : A function that
 *            takes in a function that when called will trigger the autocomplete.
 *
 * @param {String} td-typeahead-template : Set custom item template from
 *            scope
 *
 * @param {String} td-typeahead-template-url : Set custom item template
 *
 * @param {Number} td-typeahead-wait-ms (Defaults: 0) : Minimal wait time
 *            after last character typed before typehead kicks-in
 *
 * @param {Object} td-typeahead-position (Defaults: null) : Positioning the
 *            autocomplete dropdown menu.
 *            @see http://api.jqueryui.com/autocomplete/#option-position
 *
 * @param {String} ng-list (Defaults: undefined) : Multiple options separator,
 *            if enabled multiple values can be selected separated by this
 *            value. Also converts the model value to an array.
 *            @see http://docs.angularjs.org/api/ng.directive:ngList
 *
 * @example
 * <code>
	<input
		type="text"
		data-ng-model="foo"
		data-td-typeahead="item.name for item in items | filter:{name:$searchTerm}"
		data-td-typeahead-multiple="', '"
		data-td-typeahead-template-url="'bar'"
	/>
	<script type="text/ng-template" id="bar">
		state: <span ng-bind-html="item.name | tdTypeaheadHighlight:$searchTerm"></span>
	</script>
   </code>
 */
angular.module("td").directive("tdTypeahead", [
	"$http", "$q", "$compile", "$templateCache", "$parse",
	function($http, $q, $compile, $templateCache, $parse) {

	// Pulled from ui-bootstrap typeahead to parse the comprehension expression
	//                      0000011100000000000002220000000000000000333333333333333000000000004400
	var TYPEAHEAD_REGEXP = /^\s*(.*?)(?:\s+as\s+(.*?))?\s+for\s+(?:([\$\w][\$\w\d]*))\s+in\s+(.*)$/;
	function typeaheadParser(input) {
		var match = input.match(TYPEAHEAD_REGEXP);
		if (!match) {
			throw new Error(
					"Expected typeahead specification in form of '_modelValue_ (as _label_)? for _item_ in _collection_'" +
					" but got '" + input + "'.");
		}

		return {
			itemName : match[3],
			source : $parse(match[4]),
			viewMapper : $parse(match[2] || match[1]),
			modelMapper : $parse(match[1])
		};
	}

	// custom widget override
	$.widget("td.typeahead", $.ui.autocomplete, {
		_renderItem : function(ul, item) {
			return this.options.renderItem ? this.options.renderItem(ul, item) : this._super(ul, item);
		}
	});

	return {
		restrict : "A",
		require : "ngModel",
		link : function(originalScope, element, attrs, ngModelCtrl) {
			var delay = parseInt(originalScope.$eval(attrs.tdTypeaheadWaitMs) || 0, 10),
				editable = originalScope.$eval(attrs.tdTypeaheadEditable) !== false,
				minLength = originalScope.$eval(attrs.tdTypeaheadMinLength),
				template = originalScope.$eval(attrs.tdTypeaheadTemplate),
				templateUrl = originalScope.$eval(attrs.tdTypeaheadTemplateUrl),
				onSelect = $parse(attrs.tdTypeaheadOnSelect),
				isLoadingSetter = $parse(attrs.tdTypeaheadLoading).assign || angular.noop,
				parserResult = typeaheadParser(attrs.tdTypeahead),
				currentValue = ngModelCtrl.$viewValue,
				scope = originalScope.$new(),
				multipleTerminator = null,
				selectedTerms = {},
				templateContent = "",
				templatePromise, ngListMatch;

				if (attrs.ngList) {
					ngListMatch = /\/(.*)\//.exec(attrs.ngList),
					multipleTerminator = ngListMatch && ngListMatch[1] || attrs.ngList || ',';
				}

			//create a child scope for the typeahead directive so we are not polluting original scope
			//with typeahead-specific data (matches, query etc.)
			originalScope.$on("$destroy", function() {
				scope.$destroy();
			});

			if (!template && !templateUrl) {
				template = "<span ng-bind-html='$label | tdTypeaheadHighlight:$searchTerm'></span>";
			}

			templatePromise = template ? $q.when(template) : $http.get(templateUrl, {
				cache : $templateCache
			}).then(function(result) {
				return result.data;
			});

			var typeaheadOptions = {
				delay : delay,
				minLength : minLength == null ? 1 : parseInt(minLength, 10),
				source : function(request, response) {
					var term = !multipleTerminator
						? request.term
						: $.ui.autocomplete.multiTerm(element, null, multipleTerminator);

					scope.$viewValue = request.term;
					scope.$searchTerm = term;

					isLoadingSetter(originalScope, true);
					$q.all([parserResult.source(scope), templatePromise ]).then(function(data) {
						isLoadingSetter(originalScope, false);
						templateContent = data[1];
						response(data[0].map(function(item) {
							var locals = {};
							locals[parserResult.itemName] = item;
							return {
								label : parserResult.viewMapper(scope, locals),
								value : parserResult.modelMapper(scope, locals),
								data : item
							};
						}));
					}, function() {
						isLoadingSetter(originalScope, false);
					});
				},
				create : function() {
					var menuClass = originalScope.$eval(attrs.tdTypeaheadMenuClass);
					if (menuClass) {
						element.typeahead("widget").addClass(menuClass);
					}
				},
				select : function(e, ui) {
					var viewValue = ui.item.value,
						locals = {
							$event : e,
							$item : ui.item.data,
							$label : ui.item.label,
							$model : ui.item.value,
						},
						tempSelectedTerms, selectedTermsArray;
					if (multipleTerminator) {
						viewValue = $.ui.autocomplete.multiSelect(element, viewValue, multipleTerminator);
						tempSelectedTerms = selectedTerms;
						selectedTerms = {};
						selectedTermsArray = [];
						tempSelectedTerms[ui.item.value] = ui.item.data;
						angular.forEach($.ui.autocomplete.splitTerms(viewValue, multipleTerminator), function(label) {
							var selectedItem = null;
							if (tempSelectedTerms[label]) {
								selectedItem = tempSelectedTerms[label];
								selectedTerms[label] = selectedItem;
							}
							selectedTermsArray.push(selectedItem);
						});
						locals.$items = selectedTermsArray;
					}

					currentValue = viewValue;

					element[0].value = viewValue;

					originalScope.$apply(function() {
						ngModelCtrl.$setViewValue(viewValue);
					});

					// trigger the selected callback
					onSelect(originalScope, locals);

					return false;
				},
				focus : function(e, ui) {
					if (multipleTerminator) {
						return false;
					}
				},
				change : function(e, ui) {
					if (ui.item != null || editable) {
						return;
					}

					element[0].value = currentValue;

					originalScope.$apply(function() {
						ngModelCtrl.$setViewValue(currentValue);
					});
				},
				renderItem : function(ul, item) {
					var itemScope = scope.$new(),
						a;
					itemScope[parserResult.itemName] = item.data;
					itemScope.$label = item.label;
					itemScope.$model = item.value;
					scope.$on("$destroy", function() {
						itemScope.$destroy();
					});

					a = $compile($("<a>").html(templateContent))(itemScope);
					return $("<li>")
						.attr("data-value", item.value)
						.append(a)
						.appendTo(ul);
				}
			};

			if (multipleTerminator) {
				element.on("keydown", function(event) {
					if (event.keyCode === $.ui.keyCode.TAB && element.data("td-typeahead").menu.active) {
						event.preventDefault();
					}
				});
			}
			element.on("focus", function(event) {
				currentValue = ngModelCtrl.$viewValue;
			});

			if (attrs.tdTypeaheadPosition) {
				typeaheadOptions.position = originalScope.$eval(attrs.tdTypeaheadPosition);
			}

			element.typeahead(typeaheadOptions);

			if (attrs.tdTypeaheadTrigger) {
				originalScope.$eval(attrs.tdTypeaheadTrigger, {
					$search : function(value) {
						element.typeahead("search", value);
					}
				});
			}
		}
	};
} ]);

/**
 * Highlighter for the autocomplete that wraps matched text with a <strong> tag
 *
 * @param {String} query
 *
 * <code>
	Foo <span ng-bind-html="'foobar' | tdTypeaheadHighlight:'bar'"></span>
		=> Foo <span>foo<strong>bar</strong></span>
   </code>
 */
angular.module("td").filter("tdTypeaheadHighlight", [ "$sce", function($sce) {
	function escapeRegexp(queryToEscape) {
		return queryToEscape.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
	}

	return function(matchItem, query) {
		return $sce.trustAsHtml(query ? matchItem.replace(new RegExp(escapeRegexp(query), "gi"), "<strong>$&</strong>") : matchItem);
	};
} ]);
