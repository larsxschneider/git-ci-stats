var defaultConfig = {
	travis_endpoint: 'travis-ci.org',
	travis_api_endpoint: 'api.travis-ci.org',
	travis_api_token: false,
}
var config;

d3.round = function(x, n) { var ten_n = Math.pow(10,n); return Math.round(x * ten_n) / ten_n; }

function isActiveBranch(branch) {
	return (d3.select('input[name="branch"]:checked').property("value") === branch);
}

function renderBuildTimes(branch, container, barValue, data, baseUrl) {
	if (!isActiveBranch(branch)) {
		return;
	}

	var paddingLeft = 120; // space to the left of the bars
	var paddingRight = 10; // space to the right of the bars
	var barHeight = 10; // height of one bar
	var barPaddingV = 1; // vertical padding between bars
	var gridLabelHeight = 18; // space reserved for gridline labels
	var gridChartOffset = 3; // space between start of grid and first bar
	var maxBarWidth = 450; // width of the bar with the max value
	var maxErrorWidth = 450;

	// scales
	var yScale = d3.scaleBand()
		.domain(d3.range(0, data.length))
		.range([0, data.length * (barHeight+barPaddingV)]);
	var y = function(d, i) { return yScale(i) + barPaddingV*i; };
	var yText = function(d, i) { return y(d, i) + barHeight - 1; };
	var x = d3.scaleLinear()
		.domain([0, d3.max(data, barValue)])
		.range([0, maxBarWidth]);

    var maxY = yScale.domain().pop();

	// svg container element
	var chart = d3.select(container).html('').append("svg")
		.attr('width', maxBarWidth + maxErrorWidth + paddingLeft + paddingRight)
		.attr('height', gridLabelHeight + gridChartOffset + data.length * (barHeight+barPaddingV*2));

	// grid line labels
	var gridContainer = chart.append('g')
		.attr('transform', 'translate(' + paddingLeft + ',' + gridLabelHeight + ')');
	gridContainer.selectAll("text").data(x.ticks(10)).enter().append("text")
		.attr("x", x)
		.attr("dy", -3)
		.attr('font-family', 'monospace')
		.attr("text-anchor", "middle")
		.text(String);

	// vertical grid lines
	gridContainer.selectAll("line").data(x.ticks(10)).enter().append("line")
		.attr("x1", x)
		.attr("x2", x)
		.attr("y1", 0)
		.attr("y2", yScale(maxY) + gridChartOffset + barPaddingV*data.length)
		.style("stroke", "#ccc");

	// bars
	var barsContainer = chart.append('g')
		.attr('transform', 'translate(' + paddingLeft + ',' + (gridLabelHeight + gridChartOffset) + ')');
	var bar = barsContainer.selectAll("rect").data(data).enter()

	bar.append("rect")
		.attr('y', y)
		.attr('height', yScale(1))
		.attr('width', function(d) {
			v = x(barValue(d));
			return (v >= 0 ? v : 0);
		})
		.attr('stroke', 'white')
		.attr('class', 'build-time-bar')
		.attr('fill', function(d) {
			if (d.state === 'passed') {
				return '#038035'
			} else if (d.state === 'failed') {
				return '#CC0000'
			} else {
				return '#555555'
			}
		})
		.style("cursor", "pointer")
		.on('click', function(d) {
			window.open(baseUrl + d.id);
		});

	bar.append("text")
		.attr('y', yText)
		.attr('x', -115)
		.attr('font-family', 'monospace')
		.style('font-size', '10px')
		.text(function(d) {
			if (d.finished_at)
				return d.finished_at.substring(0, 10);
			if (d.started_at)
				return d.started_at.substring(0, 10);
			return '';
		});

	bar.append("text")
		.attr('y', yText)
		.attr('x', -50)
		.attr('font-family', 'monospace')
		.style('font-size', '10px')
		.style("font-weight", 'bold')
		.style("cursor", "pointer")
		.text(function(d) {
			return d.commit.sha.substring(0,7);
		})
		.on('click', function(d) {
			window.open('https://github.com/git/git/commit/' + d.commit.sha);
		});

	bar.append("text")
		.attr('y', yText)
		.attr('x', maxBarWidth + 30)
		.attr('font-family', 'monospace')
		.style('font-size', '10px')
		.text(function(d) {
			return d.failReason.sort().join(' ');
		});
}

function getBuildDate(build) {
	var dt = new Date(Date.parse(build.started_at));
	return dt.toDateString();
}

function updateChart(branch) {
	var repoName = 'git/git';
	var baseUrl = 'https://' + config.travis_endpoint + '/' + repoName + '/builds/';
	var buildsUrl = 'https://' + config.travis_api_endpoint + '/repos/' + repoName + '/builds?event_type=push';
	var jobsUrl = 'https://' + config.travis_api_endpoint + '/jobs/';

	var builds = [];
	var failedTestCount = {};

	var oldestBuild = Infinity;
	var i=0, n=20;

	var buildCounts = {};

	function updateCount(build) {
		var buildDate = getBuildDate(build);

		if (!buildCounts[buildDate]) {
			buildCounts[buildDate] = 1;
		} else {
			buildCounts[buildDate] += 1;
		}
	}

	function filterBuilds(rawData) {
		if (!('builds' in rawData) ||
			!('commits' in rawData) ||
			typeof rawData.builds.length === 'undefined' ||
			typeof rawData.commits.length === 'undefined') {
			alert('invalid repository: ' + repoName);
			return;
		}

		var curOldestBuild = oldestBuild;

		rawData.builds.forEach(function(build) {
			var buildNr = Number(build.number);
			if (buildNr < curOldestBuild) {
				curOldestBuild = buildNr;
			}

			build.commit = rawData.commits.find(function(commit, index, array) {
				return commit.id === build.commit_id;
			});

			if (build.event_type !== 'push' ||
			    build.commit.branch !== branch) {
				return;
			}

			build.failReason = [];
			build.addFailReason = function(name) {
				if (build.failReason.indexOf(name) === -1) {
					build.failReason.push(name);
				}
			}
			if (build.state !== 'passed') {
				build.job_ids.forEach(function(job_id) {
					d3.text(jobsUrl + job_id + '/log.txt', function(rawLog) {
						if (rawLog !== null && rawLog.length > 0) {
							if (rawLog.indexOf('Done. Your build exited with 0.') > 0) {
								// NOOP
							} else if (
								rawLog.indexOf('No output has been received in the last') > 0 ||
								rawLog.indexOf('The job exceeded the maxmimum time limit for jobs, and has been terminated.') > 0
							) {
								build.addFailReason('stalled');
							} else if (rawLog.indexOf('The command "make --jobs') > 0) {
								build.addFailReason('compile');
							} else if (rawLog.indexOf('The command "ci/test-documentation.sh"') > 0) {
								build.addFailReason('docs');
							} else {
								var start = rawLog.indexOf('Test Summary Report');
								var end = rawLog.indexOf('Result: FAIL', start);
								if (start > 0 && end > 0) {
									var re = /t\d\d\d\d-.+\.sh/g;
									var testSummary = rawLog.substring(start, end);
									testSummary.match(re).forEach(function(test_name) {
										build.addFailReason(test_name.substring(0,5));
									})
								} else {
									build.addFailReason('other');
									console.log('Job with unknown error detected: ' + jobsUrl + job_id + '/log.txt');
								}
							}
						} else {
							build.addFailReason('no-log');
						}
						renderBuildTimes(branch, '#build-times-duration', getDuration, builds, baseUrl);
					})
				})
			}

			updateCount(build);
			builds.push(build);
		});

		function getDuration(build) {
			return build.duration/60;
		}

		renderBuildTimes(branch, '#build-times-duration', getDuration, builds, baseUrl);

		if (++i < n && curOldestBuild < oldestBuild) {
			oldestBuild = curOldestBuild;
			retrieveJson(branch, buildsUrl + '&after_number=' + oldestBuild, filterBuilds);
		}
	}

	retrieveJson(branch, buildsUrl, filterBuilds);
}

function retrieveJson(branch, url, callback) {
	if (!isActiveBranch(branch)) {
		return;
	}
	var req = d3.json(url);
	req = req.header("Accept", 'application/vnd.travis-ci.2+json');
	req.get(callback);
}

function getConfigUrl() {
	return location.pathname.replace('index.html', '') + 'config.json';
}

d3.selectAll('input').on('change', function() {
	d3.event.preventDefault();
	updateChart(this.value);
});

config = defaultConfig;
d3.select("input[value=\"master\"]").property("checked", true);
updateChart('master');

