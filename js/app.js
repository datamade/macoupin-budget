(function(){
    var app = {}

    // Builds a cache of templates that get fetched and rendered by views
    function template_cache(tmpl_name, tmpl_data){
        if ( !template_cache.tmpl_cache ) {
            template_cache.tmpl_cache = {};
        }

        if ( ! template_cache.tmpl_cache[tmpl_name] ) {
            var tmpl_dir = '/js/views';
            var tmpl_url = tmpl_dir + '/' + tmpl_name + '.html';

            var tmpl_string;
            $.ajax({
                url: tmpl_url,
                method: 'GET',
                async: false,
                success: function(data) {
                    tmpl_string = data;
                }
            });

            template_cache.tmpl_cache[tmpl_name] = _.template(tmpl_string);
        }

        return template_cache.tmpl_cache[tmpl_name](tmpl_data);
    }

    function calc_change(cur, prev){
        if (prev == 0){
            return null
        }
        if (cur == 0 && prev == 0){
            return null
        }
        var change = parseFloat(((cur - prev) / prev) * 100);
        if (change < 0){
            change = change.toFixed(1) + '%';
        } else {
            change = '+' + change.toFixed(1) + '%';
        }
        return change
    }

    function slugify(text){
        return text
            .toLowerCase()
            .replace(/[^\w ]+/g,'')
            .replace(/ +/g, '-');
    }

    app.MainChartModel = Backbone.Model.extend({
        setYear: function(year, index){
            var exp = this.get('expenditures');
            var approp = this.get('appropriations');
            var expChange = calc_change(exp[index], exp[index -1]);
            var appropChange = calc_change(approp[index], approp[index - 1]);
            this.set({
                'selectedExp': accounting.formatMoney(exp[index]),
                'selectedApprop': accounting.formatMoney(approp[index]),
                'expChange': expChange,
                'appropChange': appropChange,
                'viewYear': year,
                'prevYear': year - 1
            });
        }
    });

    app.BreakdownRow = Backbone.Model.extend({
        yearIndex: null
    });

    app.BreakdownColl = Backbone.Collection.extend({
        setRows: function(year, index){
            var self = this;
            $.each(this.models, function(i, row){
                var query = {}
                query[row.get('type')] = row.get('rowName');
                if(typeof row.get('parent_type') !== 'undefined'){
                    query[row.get('parent_type')] = row.get('parent');
                }
                var summ = collection.getSummary(row.get('type'), query, year)
                row.set(summ);
                row.yearIndex = index;
            });

            var max_app = _.max(this.models, function(obj){return parseFloat(obj.get('appropriations'))});
            var max_exp = _.max(this.models, function(obj){return parseFloat(obj.get('expenditures'))});
            var maxes = [max_app.get('appropriations'), max_exp.get('expenditures')];

            this.maxNum = maxes.sort(function(a,b){return b-a})[0];
            $.each(this.models, function(i, row){
                var exps = row.get('expenditures');
                var apps = row.get('appropriations');
                var exp_perc = parseFloat((exps/self.maxNum) * 100) + '%';
                var app_perc = parseFloat((apps/self.maxNum) * 100) + '%';
                row.set({app_perc:app_perc, exp_perc:exp_perc});
            });
        }
    });

    app.BudgetColl = Backbone.Collection.extend({
        startYear: 1995,
        endYear: 2020,
        activeYear: 2020,
        updateYear: function(year, yearIndex){
            var expanded = [];
            $.each($('tr.expanded-content'), function(i, row){
                var name = $(row).prev().find('a.rowName').text();
                expanded.push(name);
                $(row).remove();
            })
            this.mainChartData.setYear(year, yearIndex);
            this.breakdownChartData.setRows(year, yearIndex);
            this.dataTable.fnDestroy();
            this.initDataTable();
            $.each(expanded, function(i, name){
                var sel = 'a.details:contains("' + name + '")';
                $(sel).first().trigger('click');
            })
        },
        updateTables: function(view, title, filter, year){
            // Various cleanup is needed when running this a second time.
            if(typeof this.mainChartView !== 'undefined'){
                this.mainChartView.undelegateEvents();
            }
            if($('#breakdown-table-body').html() != ''){
                $('#breakdown-table-body').empty();
            }
            if(typeof this.dataTable !== 'undefined'){
                this.dataTable.fnClearTable();
                this.dataTable.fnDestroy();
            }
            // Need to orientate the views to a top level
            if(typeof this.hierarchy[view] !== 'undefined'){
                this.topLevelView = view
            } else {
                this.bdView = view;
            }
            if (typeof year === 'undefined'){
                year = this.activeYear;
            }
            var exp = [];
            var approp = [];
            var self = this;
            var values = this.toJSON();
            var incomingFilter = false;
            if (typeof filter !== 'undefined'){
                values = _.where(this.toJSON(), filter);
                incomingFilter = true;
            }
            var yearRange = this.getYearRange()
            $.each(yearRange, function(i, year){
                exp.push(self.getTotals(values, 'Expenditures', year));
                approp.push(self.getTotals(values, 'Appropriations', year));
            });
            var yearIndex = yearRange.indexOf(parseInt(year))
            var selExp = exp[yearIndex];
            var prevExp = exp[yearIndex - 1];
            var expChange = calc_change(selExp, prevExp);
            var selApprop = approp[yearIndex];
            var prevApprop = approp[yearIndex - 1];
            var appropChange = calc_change(selApprop, prevApprop);
            this.mainChartData = new app.MainChartModel({
                expenditures: exp,
                appropriations: approp,
                title: title,
                viewYear: year,
                prevYear: year - 1,
                selectedExp: accounting.formatMoney(selExp),
                selectedApprop: accounting.formatMoney(selApprop),
                appropChange: appropChange,
                expChange: expChange,
                view: self.topLevelView
            });
            var bd = []
            var chartGuts = this.pluck(view).getUnique();
            var all_nums = []
            $.each(chartGuts, function(i, name){
                if (!incomingFilter){
                    filter = {}
                }
                filter[view] = name;
                var summary = self.getSummary(view, filter, year);
                if (summary){
                    var row = new app.BreakdownRow(summary);
                    bd.push(row);
                    all_nums.push(summary['expenditures']);
                    all_nums.push(summary['appropriations']);
                }
            });
            var maxNum = all_nums.sort(function(a,b){return b-a})[0];
            this.breakdownChartData = new app.BreakdownColl(bd);
            this.breakdownChartData.maxNum = maxNum;
            this.breakdownChartData.forEach(function(row){
                var exps = accounting.unformat(row.get('expenditures'));
                var apps = accounting.unformat(row.get('appropriations'));
                var exp_perc = parseFloat((exps/maxNum) * 100) + '%';
                var app_perc = parseFloat((apps/maxNum) * 100) + '%';
                row.set({app_perc:app_perc, exp_perc:exp_perc});
                var rowView = new app.BreakdownSummary({model:row});
                $('#breakdown-table-body').append(rowView.render().el);
            });
            this.mainChartView = new app.MainChartView({
                model: self.mainChartData
            });
            this.initDataTable();
        },
        initDataTable: function(){
            this.dataTable = $("#breakdown").dataTable({
                "aaSorting": [[1, "desc"]],
                "aoColumns": [
                    null,
                    {'sType': 'currency'},
                    {'sType': 'currency'},
                    null
                ],
                "bFilter": false,
                "bInfo": false,
                "bPaginate": false,
                "bRetrieve": true,
                "bAutoWidth": false
            });
        },
        bootstrap: function(init, year){
            var self = this;
            this.spin('#main-chart', 'large');
            $.when($.get('/data/macoupin-budget-cleaned.csv')).then(
                function(data){
                    var json = $.csv.toObjects(data);
                    var loadit = []
                    $.each(json, function(i, j){
                        j['Fund Slug'] = slugify(j['Fund']);
                        j['Department Slug'] = slugify(j['Department']);
                        j['Expense Line Slug'] = slugify(j['Expense Line']);
                        j['Control Officer Slug'] = slugify(j['Control Officer']);
                        loadit.push(j)
                    });
                    self.reset(loadit);
                    self.hierarchy = {
                        Fund: ['Fund', 'Department', 'Expense Line'],
                        "Control Officer": ['Control Officer', 'Department', 'Expense Line']
                    }
                    if (typeof init === 'undefined'){
                        self.topLevelView = 'Fund';
                        if (!year){
                            year = 2020;
                        }
                        self.updateTables('Fund', 'Macoupin County Budget', undefined, year);
                    } else {
                        self.topLevelView = init[0];
                        var lowerView = init[0];
                        var name = init[1];
                        var filter = {}
                        var key = init[0] + ' Slug'
                        filter[key] = name;
                        var title = self.findWhere(filter).get(init[0])
                        if (init.length == 2){
                            lowerView = 'Department';
                        }
                        if(init.length > 2){
                            name = init[2];
                            lowerView = 'Expense Line';
                            filter['Department Slug'] = name;
                            title = self.findWhere(filter).get('Department');
                        }
                        self.updateTables(lowerView, title, filter, year);
                    }
                }
            );
        },
        spin: function(element, option){
            // option is either size of spinner or false to cancel it
            $(element).spin(option);
        },
        // Returns an array of valid years.
        getYearRange: function(){
            return Number.range(this.startYear, this.endYear + 1);
        },
        reduceTotals: function(totals){
            return totals.reduce(function(a,b){
              var int_a = parseFloat(a);
              var int_b = parseFloat(b);
              return int_a + int_b;
            });
        },

        // Returns a total for a given category and year
        // Example: "Expenditures 1995"
        getTotals: function(values, category, year){
            var all = _.pluck(values, category + ' ' + year);
            return this.reduceTotals(all);
        },
        getChartTotals: function(category, rows, year){
            var totals = [];
            $.each(rows, function(i, row){
                var attr = category + ' ' + year
                var val = row.get(attr);
                totals.push(val);
            });
            return totals;
        },
        getSummary: function(view, query, year){
            if (typeof year === 'undefined'){
                year = this.activeYear;
            }
            var guts = this.where(query);
            if (guts.length < 1) {
                return null;
            }
            var summary = {};
            var self = this;
            var exp = self.getChartTotals('Expenditures', guts, year);
            var approp = self.getChartTotals('Appropriations', guts, year);
            var prevExp = self.getChartTotals('Expenditures', guts, year - 1);
            var prevApprop = self.getChartTotals('Appropriations', guts, year - 1);
            var expChange = calc_change(self.reduceTotals(exp), self.reduceTotals(prevExp));
            var appropChange = calc_change(self.reduceTotals(approp), self.reduceTotals(prevApprop));
            var self = this;

            $.each(guts, function(i, item){
                summary['rowName'] = item.get(view);
                summary['prevYear'] = year - 1;
                summary['year'] = year;
                summary['description'] = item.get(view + ' Description');
                summary['expenditures'] = self.reduceTotals(exp);
                summary['appropriations'] = self.reduceTotals(approp);
                summary['expChange'] = expChange;
                summary['appropChange'] = appropChange;
                summary['rowId'] = item.get(view + ' ID');
                summary['type'] = view
                summary['link'] = item.get('Link to Website');
                var hierarchy = self.hierarchy[self.topLevelView]
                var ranking = hierarchy.indexOf(view)

                if (ranking == 0){
                    summary['child'] = hierarchy[1];
                    summary['parent_type'] = null;
                } else if(ranking == 1){
                    summary['child'] = hierarchy[2];
                    summary['parent_type'] = hierarchy[0];
                } else if(ranking == 2) {
                    summary['child'] = null;
                    summary['parent_type'] = hierarchy[1];
                }
                if(summary['parent_type']){
                    summary['parent'] = self.mainChartData.get('title')
                }
                summary['slug'] = item.get(view + ' Slug');
            });
            if (typeof summary['expenditures'] !== 'undefined'){
                return summary
            } else {
                return null
            }
        }
    });

    app.MainChartView = Backbone.View.extend({
        el: $('#main-chart'),

        // The bulk of the chart options are defined in the budget_highcharts.js file
        // and attached to the window over there. Dunno if that's the best approach but it works
        chartOpts: window.mainChartOpts,

        events: {
            'click .breakdown-choice': 'breakIt'
        },

        // Render the view when you initialize it.
        initialize: function(){
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
            this.updateCrumbs();
            this.model.on('change', function(model){
                if(!model.get('appropChange')){
                    $('.main-approp').hide();
                } else {
                    $('.main-approp').show();
                }
                if(!model.get('expChange')){
                    $('.main-exp').hide();
                } else {
                    $('.main-exp').show();
                }
            });
        },
        updateCrumbs: function(){
            var links = ['<a href="/">Macoupin County</a>'];
            if(Backbone.history.fragment){
                var parts = Backbone.history.fragment;
                if (parts.indexOf('?') >= 0){
                    var idx = parts.indexOf('?');
                    parts = parts.slice(0,idx).split('/')
                } else {
                    parts = parts.split('/');
                }
                var crumbs = parts.slice(1, parts.length);
                var topView = collection.topLevelView;
                var query = {}
                $.each(crumbs, function(i, crumb){
                    var link = '<a href="#' + parts.slice(0,i+2).join('/') + '">';
                    if(i==0){
                        var key = topView + ' Slug';
                        query[key] = crumb;
                        link += collection.findWhere(query).get(topView);
                    }
                    if(i==1){
                        query['Department Slug'] = crumb;
                        link += collection.findWhere(query).get('Department');
                    }
                    if(i==2){
                        query['Expense Line Slug'] = crumb;
                        link += collection.findWhere(query).get('Expense Line');
                    }
                    link += '</a>';
                    links.push(link);
                });
            }
            $('#breadcrumbs').html(links.join(' > '));
        },
        // This is where the magic happens. Grab the template from the template_cache function
        // at the top of this file and then update the chart with what's passed in as the model.
        render: function(){
            this.$el.html(template_cache('mainChart', {model: this.model}));
            this._modelBinder.bind(this.model, this.el, {
                viewYear: '.viewYear',
                prevYear: '.prevYear',
                selectedExp: '.expenditures',
                selectedApprop: '.appropriations',
                expChange: '.expChange',
                appropChange: '.appropChange'
            });
            this.updateChart(this.model, this.model.get('viewYear'));
            return this;
        },
        updateChart: function(data, year){
            if (typeof this.highChart !== 'undefined'){
                delete this.highChart;
            }
            var exps = jQuery.extend(true, [], data.get('expenditures'));
            var approps = jQuery.extend(true, [], data.get('appropriations'));
            var exp = [];
            var approp = [];
            $.each(exps, function(i, e){
                if (isNaN(e)){ e = null; }
                else { e = parseFloat(e) }
                exp.push(e);
            })
            $.each(approps, function(i, e){
                if (isNaN(e)){ e = null; }
                else { e = parseFloat(e) }
                approp.push(e);
            });
            var minValuesArray = $.grep(approp.concat(exp),
              function(val) { return val != null; });
            var globalOpts = app.GlobalChartOpts;
            this.chartOpts.plotOptions.area.pointInterval = globalOpts.pointInterval;
            this.chartOpts.plotOptions.area.pointStart = Date.UTC(collection.startYear, 1, 1);
            this.chartOpts.plotOptions.series.point.events.click = this.pointClick;
            this.chartOpts.series = [{
                color: globalOpts.apropColor,
                data: approp,
                marker: {
                    radius: 6,
                    symbol: globalOpts.apropSymbol
                },
                name: globalOpts.apropTitle
              }, {
                color: globalOpts.expendColor,
                data: exp,
                marker: {
                    radius: 6,
                    symbol: globalOpts.expendSybmol
                },
                name: globalOpts.expendTitle
            }];
            this.chartOpts.yAxis.min = Math.min.apply( Math, minValuesArray )


            var selectedYearIndex = year - collection.startYear;
            this.highChart = new Highcharts.Chart(this.chartOpts, function(){
                this.series[0].data[selectedYearIndex].select(true, true);
                this.series[1].data[selectedYearIndex].select(true, true);
            });
        },
        pointClick: function(e){
            $("#readme").fadeOut("fast");
            $.cookie("budgetbreakdownreadme", "read", { expires: 7 });
            var x = this.x,
            y = this.y,
            selected = !this.selected,
            index = this.series.index;
            this.select(selected, false);

            $.each($('.budget-chart'), function(i, chart){
              var sel_points = $(chart).highcharts().getSelectedPoints();
              $.each(sel_points, function(i, point){
                  point.select(false);
              });
              $.each($(chart).highcharts().series, function(i, serie){
                  $(serie.data).each(function(j, point){
                    if(x === point.x && point.y != null) {
                      point.select(selected, true);
                    }
                  });
              });
            });
            var clickedYear = new Date(x).getFullYear();
            var yearIndex = this.series.processedYData.indexOf(y);
            var hash = window.location.hash;
            if(hash.indexOf('?') >= 0){
                hash = hash.slice(0, hash.indexOf('?'));
            }
            app_router.navigate(hash + '?year=' + clickedYear);
            collection.updateYear(clickedYear, yearIndex);
            $.each($('.bars').children(), function(i, bar){
                var width = $(bar).text();
                $(bar).css('width', width);
            });
        },
        breakIt: function(e){
            e.preventDefault();
            var view = $(e.currentTarget).data('choice');
            var year = window.location.hash.split('=')[1];
            app_router.navigate('?year=' + year);
            collection.updateTables(view, 'Macoupin County Budget', undefined, year);
        }
    })

    // Breakdown Chart view. Does a lot the same kind of things as the main chart view
    app.BreakdownSummary = Backbone.View.extend({
        tagName: 'tr',
        className: 'rowId',
        detailShowing: false,
        events: {
            'click .details': 'details'
        },
        initialize: function(){
            this._modelBinder = new Backbone.ModelBinder();
            var self = this;
            this.model.on('change', function(model){
                var sel = '#' + model.get('slug') + '-selected-chart';
                var exp = accounting.unformat(model.get('expenditures'));
                var approp = accounting.unformat(model.get('appropriations'));
                if((exp + approp) == 0){
                    $(self.el).hide();
                    if($(self.el).next().is(':visible')){
                        $(self.el).next().hide();
                    }
                } else {
                    $(self.el).show();
                }
                if(!model.get('appropChange')){
                    $(sel).parent().find('.sparkline-budgeted').hide();
                } else {
                    $(sel).parent().find('.sparkline-budgeted').show();
                }
                if(!model.get('expChange')){
                    $(sel).parent().find('.sparkline-spent').hide();
                } else {
                    $(sel).parent().find('.sparkline-spent').show();
                }
            });
        },
        render: function(){
            this.$el.html(template_cache('breakdownSummary', {model:this.model}));
            this._modelBinder.bind(this.model, this.el, {
                expenditures: {selector: '[name="expenditures"]', converter: this.moneyChanger},
                appropriations: {selector: '[name="appropriations"]', converter: this.moneyChanger},
                app_perc: {selector: '[name=app_perc]'},
                exp_perc: {selector: '[name=exp_perc]'}
            });
            return this;
        },
        moneyChanger: function(direction, value){
            return accounting.formatMoney(value);
        },
        details: function(e){
            e.preventDefault();
            if (typeof this.detailView !== 'undefined'){
                this.detailView.undelegateEvents();
            }
            if (this.$el.next().hasClass('expanded-content')){
                this.$el.next().remove();
                this.$el.find('img').attr('src', 'images/expand.png')
            } else {
                var filter = {};
                var type = this.model.get('type');
                filter[type] = this.model.get('rowName');
                var parent_type = this.model.get('parent_type');
                if(parent_type){
                    filter[parent_type] = this.model.get('parent');
                }
                var expenditures = [];
                var appropriations = [];
                $.each(collection.getYearRange(), function(i, year){
                    var exps = collection.where(filter)
                    var exp = collection.getChartTotals('Expenditures', exps, year);
                    if (exp.length > 1){
                        expenditures.push(collection.reduceTotals(exp));
                    } else {
                        expenditures.push(parseFloat(exp[0]));
                    }
                    var apps = collection.where(filter);
                    var approp = collection.getChartTotals('Appropriations', apps, year);
                    if (approp.length > 1){
                        appropriations.push(collection.reduceTotals(approp));
                    } else {
                        appropriations.push(parseFloat(approp[0]));
                    }
                });
                this.model.allExpenditures = expenditures;
                this.model.allAppropriations = appropriations;
                this.detailView = new app.BreakdownDetail({model:this.model});
                this.detailView.render().$el.insertAfter(this.$el);
                this.detailView.updateChart();
                this.$el.find('img').attr('src', 'images/collapse.png')
            }
        }
    })

    app.BreakdownDetail = Backbone.View.extend({
        tagName: 'tr',
        className: 'expanded-content',
        chartOpts: window.sparkLineOpts,

        events: {
            'click .breakdown': 'breakdownNav'
        },
        initialize: function(){
            this._modelBinder = new Backbone.ModelBinder();
        },
        render: function(){
            this.$el.html(template_cache('breakdownDetail', {model: this.model}));
            this._modelBinder.bind(this.model, this.el, {
                prevYear: '.prevYear',
                expChange: '.expChange',
                appropChange: '.appropChange'
            });
            return this;
        },

        breakdownNav: function(e){
            var filter = {}
            var typeView = this.model.get('type');
            filter[typeView] = this.model.get('rowName')
            var path = this.model.get('slug');
            if (this.model.get('parent')){
                var hierarchy = collection.hierarchy[collection.topLevelView]
                var type_pos = hierarchy.indexOf(typeView)
                var parent_type = hierarchy[type_pos - 1];
                filter[parent_type] = this.model.get('parent');
                path = slugify(this.model.get('parent')) + '/' + this.model.get('slug')
            }
            collection.updateTables(this.model.get('child'), this.model.get('rowName'), filter, this.model.get('year'));
            document.title = document.title + ' | ' + this.model.get('rowName');
            $('#secondary-title').text(this.model.get('child'));
            var pathStart = null;
            if(collection.topLevelView == 'Fund'){
                pathStart = 'fund-detail/';
            } else {
                pathStart = 'control-officer-detail/';
            }
            $('html, body').animate({
                scrollTop: $('#breadcrumbs').offset().top
            });
            app_router.navigate(pathStart + path + '?year=' + this.model.get('year'));
            collection.mainChartView.updateCrumbs();
        },

        updateChart: function(){
            if (typeof this.highChart !== 'undefined'){
                delete this.highChart;
            }
            var data = this.model;
            var exp = [];
            var approp = [];
            $.each(data.allExpenditures, function(i, e){
                if (isNaN(e)){ e = null; }
                else { e = parseFloat(e) }
                exp.push(e);
            })
            $.each(data.allAppropriations, function(i, e){
                if (isNaN(e)){ e = null; }
                else { e = parseFloat(e) }
                approp.push(e);
            });
            var minValuesArray = $.grep(approp.concat(exp),
              function(val) { return val != null; });
            var globalOpts = app.GlobalChartOpts;
            this.chartOpts.chart.renderTo = data.get('slug') + "-selected-chart";
            this.chartOpts.plotOptions.area.pointInterval = globalOpts.pointInterval
            this.chartOpts.plotOptions.area.pointStart = Date.UTC(collection.startYear, 1, 1)
            this.chartOpts.yAxis.min = Math.min.apply( Math, minValuesArray )
            this.chartOpts.plotOptions.series.point.events.click = this.pointClick;
            this.chartOpts.series = [{
                color: globalOpts.apropColor,
                data: approp,
                marker: {
                  radius: 4,
                  symbol: globalOpts.apropSymbol
                },
                name: globalOpts.apropTitle
              }, {
                color: globalOpts.expendColor,
                data: exp,
                marker: {
                  radius: 5,
                  symbol: globalOpts.expendSybmol
                },
                name: globalOpts.expendTitle
              }]
            // select current year

            var selectedYearIndex = this.model.get('year') - collection.startYear;
            this.highChart = new Highcharts.Chart(this.chartOpts, function(){
                this.series[0].data[selectedYearIndex].select(true, true);
                this.series[1].data[selectedYearIndex].select(true, true);
            });
        },

        // Handler for the click events on the points on the chart
        pointClick: function(e){
            $("#readme").fadeOut("fast");
            $.cookie("budgetbreakdownreadme", "read", { expires: 7 });
            var x = this.x,
            y = this.y,
            selected = !this.selected,
            index = this.series.index;
            this.select(selected, false);
            var active_chart;
            $.each($('.budget-chart'), function(i, chart){
              var sel_points = $(chart).highcharts().getSelectedPoints();
              $.each(sel_points, function(i, point){
                  point.select(false);
              });
              $.each($(chart).highcharts().series, function(i, serie){
                  $(serie.data).each(function(j, point){
                    if(x === point.x && point.y != null) {
                      active_chart = chart;
                      point.select(selected, true);
                    }
                  });
              });
            });
            var clickedYear = new Date(x).getFullYear();
            var yearIndex = this.series.processedYData.indexOf(y);
            var hash = window.location.hash;
            if(hash.indexOf('?') >= 0){
                hash = hash.slice(0, hash.indexOf('?'));
            }
            app_router.navigate(hash + '?year=' + clickedYear);
            collection.updateYear(clickedYear, yearIndex);
            $.each($('.bars').children(), function(i, bar){
                var width = $(bar).text();
                $(bar).css('width', width);
            });
        }
    });

    app.GlobalChartOpts = {
        pointInterval: 365 * 24 * 3600 * 1000, //one year in ms
        apropColor:   '#13345a',
        apropSymbol:  'circle',
        apropTitle:   'Appropriations',
        expendColor:  '#405c7d',
        expendSybmol: 'square',
        expendTitle:  'Expenditures'
    }

    app.Router = Backbone.Router.extend({
        // Maybe the thing to do here is to construct a separate route for
        // the two different top level views. So, fund-detail and control-officer-detail
        // or something. That would require making sure the correct route is
        // triggered when links are clicked. Not impossible but probably cleaner
        routes: {
            "fund-detail/:topName(/:secondName)": "fundDetailRoute",
            "control-officer-detail/:topName(/:secondName)": "controlDetailRoute",
            "(?year=:year)": "defaultRoute"
        },
        initialize: function(options){
            this.collection = options.collection;
        },
        defaultRoute: function(year){
            $('#secondary-title').text('Fund');
            var init = undefined;
            this.collection.bootstrap(init, year);
        },
        fundDetailRoute: function(topName, secondName){
            var initYear = this.getInitYear('Fund', topName, secondName);
            var init = initYear[0];
            var year = initYear[1];
            this.collection.bootstrap(init, year);
        },
        controlDetailRoute: function(topName, secondName){
            var initYear = this.getInitYear('Control Officer', topName, secondName);
            var init = initYear[0];
            var year = initYear[1];
            this.collection.bootstrap(init, year);
        },
        getInitYear: function(view, topName, secondName){
            var init = [view];
            var top = topName;
            var idx = topName.indexOf('?');
            var year = undefined;
            if (idx >= 0){
                top = topName.slice(0, idx);
                year = topName.slice(idx+1, topName.length).replace('year=', '');
            }
            init.push(top);
            if(secondName){
                var second = secondName;
                var idx = secondName.indexOf('?');
                if (idx >= 0){
                    second = secondName.slice(0, idx);
                    year = secondName.slice(idx+1, secondName.length).replace('year=', '');
                }
                init.push(second);
            }
            return [init, year]
        }
    });
    var collection = new app.BudgetColl();
    var app_router = new app.Router({collection: collection});
    Backbone.history.start();
})()
