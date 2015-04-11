angular.module("beatbox").factory("bbPlayer", function(bbConfig, bbUtils, ng) {
	var sounds = { };
	for(var i in bbConfig.instruments) {
		for(var j=0; j<bbConfig.instruments[i].strokes.length; j++) {
			var k = i+"_"+bbConfig.instruments[i].strokes[j];
			sounds[k] = new Howl({
				urls: [ "assets/audio/"+k+".mp3" ]
			});
		}
	}

	var allPlayers = [ ];

	var bbPlayer = {
		playSounds: function(instrument_strokes) {
			for(var i=0; i<instrument_strokes.length; i++) {
				if(sounds[instrument_strokes[i]])
					sounds[instrument_strokes[i]].play();
			}
		},

		_abstractPlay: function(func, options, callback) {
			if(options == null)
				options = { };
			if(options.speed == null)
				options.speed = 100;
			if(options.mute == null)
				options.mute = { };

			var timeout;
			var timeoutFunc;

			var ret = {
				playing : true,
				stop : function() {
					if(this.playing) {
						clearTimeout(timeout);
						this.playing = false;
					}
				},
				start : function() {
					if(!this.playing) {
						this.playing = true;
						timeoutFunc();
					}
				}
			};

			async.forever(
				function(next) {
					var time = func(next);
					if(!time) {
						ret.playing = false;
						return callback && callback();
					}

					timeout = setTimeout(next, time);
					timeoutFunc = next;
				}
			);

			allPlayers.push(ret);
			return ret;
		},

		playPattern: function(pattern, options, callback, _specialStrokeCallback) {
			var patternIdx = 0;
			return this._abstractPlay(function() {
				if(patternIdx == pattern.length*pattern.time) {
					if(callback)
						return false;
					else
						patternIdx = 0;
				}

				if(options.strokeCallback)
					options.strokeCallback(patternIdx);

				if(_specialStrokeCallback)
					_specialStrokeCallback(patternIdx);

				var strokes = [ ];
				for(var instr in bbConfig.instruments) {
					if((!options.headphones || options.headphones == instr) && (!options.mute[instr]) && pattern[instr] && pattern[instr][patternIdx] && pattern[instr][patternIdx] != " ")
						strokes.push(instr+"_"+pattern[instr][patternIdx]);
				}
				bbPlayer.playSounds(strokes);

				patternIdx++;

				return 60000/options.speed/pattern.time;
			}, options, callback);
		},

		playSong: function(song, options, callback) {
			var buffer = { };
			var songIdx = 0;

			var patternPlayers = [ ];

			var ret = {
				playing : true,
				stop : function() {
					if(this.playing) {
						for(var j=0; j<patternPlayers.length; j++)
							patternPlayers[j].stop();
						this.playing = false;
					}
				},
				start : function() {
					if(!this.playing) {
						this.playing = true;
						for(var j=0; j<patternPlayers.length; j++)
							patternPlayers[j].start();
					}
				}
			};

			async.forever(function(next) {
				patternPlayers = [ ];

				if(songIdx >= bbUtils.getSongLength(song)) {
					ret.playing = false;
					return callback && callback();
				}

				var pattern = { };
				for(var inst in bbConfig.instruments) {
					if(song[songIdx] && song[songIdx][inst] && bbUtils.getPattern(song[songIdx][inst]))
						buffer[inst] = bbUtils.splitPattern(bbUtils.getPattern(song[songIdx][inst]), inst);

					if(buffer[inst] && buffer[inst].length > 0)
						pattern[inst] = buffer[inst].shift();
				}

				// Different instruments might have different time measurements
				var timePatterns = { };
				for(var j in pattern) {
					var time = pattern[j].time; // was set by splitPattern()
					if(!timePatterns[time]) // .time was set by splitPattern()
						timePatterns[time] = { time: time, length: 4 };
					timePatterns[time][j] = pattern[j];
				}

				if(Object.keys(timePatterns).length == 0) {
					timePatterns[4] = { time: 4, length: 4 };
				}

				var funcs = [ ];
				var first = true;
				ng.forEach(timePatterns, function(it) {
					var songIdxBkp = songIdx;
					funcs.push(function(next) {
						patternPlayers.push(bbPlayer.playPattern(it, options, next, first && options.beatCallback ? function(patternIdx) {
							if(patternIdx%it.time == 0)
								options.beatCallback(songIdxBkp*4 + patternIdx/it.time);
						} : null));
						first = false;
					});
				});

				songIdx++;

				async.parallel(funcs, next);
			});
			return ret;
		},

		stopAll : function() {
			allPlayers.forEach(function(it) {
				it.stop();
			});
		}
	};

	return bbPlayer;
});