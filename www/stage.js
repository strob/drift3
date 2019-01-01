var T = T || {};
var D = D || {};		// Data
var C = C || {
    STATUS: {
	UNINITIALIZED: 'uninitialized',
	LOADING: 'loading',
	READY: 'ready',
	ERROR: 'error'
    }
};

function cached_get_url(url, proc_fn) {
    D.urls = D.urls || {};
    if(D.urls[url + '_status'] != C.STATUS.READY) {
	if(D.urls[url + '_status'] != C.STATUS.LOADING) {
	    D.urls[url + '_status'] = C.STATUS.LOADING;

	    FARM.get(url, (ret) => {
		if(proc_fn) {
		    ret = proc_fn(ret);
		}
		D.urls[url] = ret;
		D.urls[url + '_status'] = C.STATUS.READY;
		render();	// XXX
	    });
	}
	return {loading: true};
    }
    return D.urls[url];
}

// legacy
function get_cur_pitch() {
    return (get_data(T.cur_doc)||{}).pitch
}
function get_cur_align() {
    return (get_data(T.cur_doc)||{}).align
}
function get_cur_rms() {
    return (get_data(T.cur_doc)||{}).rms
}

function get_data(docid) {
    // or null if they're not loaded...

    let meta = T.docs[docid];
    if(!meta) { return }

    if(!meta.pitch) { return }
    let pitch = cached_get_url('/media/' + meta.pitch, parse_pitch);
    if(pitch.loading) { return }

    if(!meta.align) { return }
    let align = cached_get_url('/media/' + meta.align, JSON.parse);
    if(align.loading) { return }

    if(!meta.rms) { return }
    let rms = cached_get_url('/media/' + meta.rms, JSON.parse);
    if(rms.loading) { return }

    return {pitch, align, rms}
}


T.XSCALE = 300;
T.PITCH_H= 250;
T.LPAD = 50;
T.MAX_A= 15;

if(!T.docs) {
    T.docs = {};
    reload_docs();
}

function reload_docs() {
    T.LAST_T = T.LAST_T || 0;
    let firsttime = !T.LAST_T;

    FARM.get_json("/_rec/_infos.json?since=" + T.LAST_T, (ret) => {
	ret.forEach((doc) => {
            T.docs[doc.id] = doc;
	    T.LAST_T = Math.max(T.LAST_T, doc.modified_time);
	});
	if(firsttime) {
            window.onhashchange();
	}
	if(ret.length > 0) {
            window.onhashchange(); // !!!
            render();
	}

	window.setTimeout(reload_docs, 3000);
    });
}


function get_docs() {
    return Object.keys(T.docs)
        .map((x) => Object.assign({}, T.docs[x], {id: x}))
        .sort((x,y) => x.date > y.date ? -1 : 1);
}

function render_header(root) {
    var head = root.div({
        id: 'head'
    });

    head.div({
        id: 'logo',
        text: "drift3",
        events: {
            onclick: () => {
                window.location.hash = "";
            }
        }
    });

    return head;
}

function render_uploader(root) {
    var upl = new PAL.Element("div", {
        parent: root,
        id: "new-item",
        classes: ['upload', 'listitem', T.drag_over ? 'drag' : ''],
        text: T.drag_over ? "Release files to upload" : "Drag audio files here to upload",
        events: {
            ondragover: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "copy";

                T.drag_over=true;
                render();
            },
            ondragleave: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();

                T.drag_over=false;
                render();
            },
            ondrop: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();

                console.log("drop");
                T.drag_over=false;
                render();

                got_files(ev.dataTransfer.files);
            }
        }
    });
    new PAL.Element("br", {
        id: "u-br",
        parent: upl});

    new PAL.Element("input", {
        parent: upl,
        attrs: {
            type: "file",
            multiple: true
        },
        id: "upl2",
        events: {
            onchange: function(ev) {
                got_files(ev.target.files);
            }
        }
    });
}

function got_files(files) {
    if(files.length > 0) {
        for(var i=0; i<files.length; i++) {

            (function(file) {

                var drift_doc = {
                    title: file.name,
                    size: file.size,
                    date: new Date().getTime()/1000
                };

                FARM.post_json("/_rec/_create", drift_doc, (ret) => {

                    T.docs[ret.id] = ret;
                    render();

                    attach.put_file(file, function(x) {
                        console.log('done', x);

                        FARM.post_json("/_rec/_update", {
                            id: ret.id,
                            path: x.path
                        }, (u_ret) => {
                            Object.assign(T.docs[ret.id], u_ret.update);
                            render();

                            // Immediately trigger a pitch trace
                            FARM.post_json("/_pitch", {id: ret.id}, (p_ret) => {
                                console.log("pitch returned");

                            });

			    // ...and RMS
			    FARM.post_json("/_rms", {id: ret.id}, (c_ret) => {
				console.log("rms returned");
			    });

			    // // TODO: FFT
			    // FARM.post_json("/_fft", {id: docid}, (c_ret) => {
			    // 	console.log("rms returned");
			    // });
                        });

                    }, function(p, cur_uploading) {
                        T.docs[ret.id].upload_status = p / ret.size;
                        render();
                    });

                });

            })(files[i]);
        }
    }
}

function render_doclist(root) {
    // XXX: preload list of docs
    get_docs()
        .forEach((doc) => {

            var doc_has_everything = doc.path && doc.transcript && get_docs(doc.id);

            if(!doc_has_everything) {
		var docel = root.div({
                    id: "item-" + doc.id,
                    classes: ['listitem', doc_has_everything ? 'ready' : 'pending'],
		});

		new PAL.Element("div", {
                    id: "del-" + doc.id,
                    classes: ['delete'],
                    text: 'delete',
                    events: {
			onclick: (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();

                            FARM.post_json("/_rec/_remove", {id: doc.id}, (ret) => {
				delete T.docs[ret.remove];
				render();
                            });

                            console.log("delete", doc.id);
			}
                    },
                    parent: docel
		});

		new PAL.Element("div", {
                    id: "title-" + doc.id,
                    classes: ['title'],
                    text: doc.title,
                    parent: docel});

		if(doc.upload_status && !doc.path) {
                    // Show progress
                    new PAL.Element("progress", {
			id: doc.id + '-progress',
			parent: docel,
			attrs: {
                            max: "100",
                            value: "" + Math.floor((100*doc.upload_status))
			},
                    })
		}
		if(!doc.pitch) {
                    new PAL.Element("div", {
			id: doc.id + "-pload",
			parent: docel,
			text: "Computing pitch...",
			events: {
                            onclick: (ev) => {
				ev.preventDefault();
				ev.stopPropagation();

				FARM.post_json("/_pitch", {id: doc.id}, (ret) => {
                                    console.log("pitch returned");

				});

                            }
			}
                    });
		}
		if(!doc.transcript) {
                    render_paste_transcript(docel, doc.id);
		}
	    }

	    // doc ready!!

	    root.div({id: doc.id,
		      text: doc.title,
		      classes: [get_data(doc.id) ? 'ready' : 'pending'],
		      events: {
			  onclick: () => {
			      if(get_data(doc.id)) {
				  window.location.hash = doc.id;
			      }
			  }
		      }
		     })

	})
}

function render_paste_transcript(root, docid) {

    new PAL.Element("div", {
        parent: root,
        id: "ptrans-" + docid,
        classes: ['paste'],
        text: "paste in a transcript to continue"
    });

    // T.transpastes[docid] =
    new PAL.Element("textarea", {
        parent: root,
        id: 'tscript-' + docid,
        classes: ['ptext'],
        events: {
            onclick: (ev) => {
                ev.stopPropagation();
            }
        }
    });
    new PAL.Element("br", {
        id: 'br-' + docid,
        parent: root
    });

    new PAL.Element("button", {
        parent: root,
        text: "set transcript",
        events: {
            onclick: function(ev) {

                ev.preventDefault();
                ev.stopPropagation();

                // XXX: do something to prevent dual-submission...

                var txt = document.getElementById('tscript-' + docid).value;
                if(txt) {
                    var blob = new Blob([txt]);
                    blob.name = "_paste.txt";
                    attach.put_file(blob, function(ret) {
                        // Uploaded transcript!
                        FARM.post_json("/_rec/_update", {
                            id: docid,
                            transcript: ret.path
                        }, (ret) => {
                            Object.assign(T.docs[docid], ret.update);
                            render();

                            // Immediately trigger an alignment
                            FARM.post_json("/_align", {id: docid}, (p_ret) => {
                                console.log("align returned");

				// Trigger CSV computation (assuming pitch also there)
				FARM.post_json("/_csv", {id: docid}, (c_ret) => {
				    console.log("csv returned");
				});
                            });


                        });
                    });
                }

            }
        }
    });
}

function parse_pitch(pitch) {
    return pitch.split('\n')
        .filter((x) => x.length > 5)
        .map((x) => Number(x.split(' ')[1]));
}

function smooth(seq, N) {
    N = N || 5;

    let out = [];

    for(let i=0; i<seq.length; i++) {

	let npitched = 0;
	let v = 0;

	for(let j=0; j<N; j++) {
	    let j1 = Math.max(0, Math.min(j+i, seq.length-1));
	    var v1 = seq[j1];
	    if(v1 > 20) {
		v += v1;
		npitched += 1;
	    }
	    else if(j1 >= i) {
		// Hit gap after idx
		break
	    }
	    else if(j1 <= i) {
		// Hit gap before/on: reset
		npitched=0;
		v=0;
	    }
	}
	if(npitched > 1) {
	    v /= npitched;
	}

	out.push(v);
    }

    return out;
}

function derivative(seq) {
    let out = [];
    for(let i=0; i<seq.length; i++) {
	let s1 = seq[i];
	let s2 = seq[i+1];
    	if(s1 && s2) {// && s1 > 20 && s2 > 20) {
	    out.push(s2 - s1);
	}
	else {
	    out.push(0)
	}
    }
    return out;
}

function get_distribution(seq, name) {
    name = name || '';

    seq = Object.assign([], seq).sort((x,y) => x > y ? 1 : -1);

    if(seq.length==0) {
	return {}
    }

    // Ignore outliers
    seq = seq.slice(Math.floor(seq.length*0.09),
		    Math.floor(seq.length*0.91));

    let out = {};
    out[name + 'mean'] = seq.reduce((acc,x)=>acc+x,0) / seq.length;
    out[name + 'percentile_9'] = seq[0];
    out[name + 'percentile_91'] = seq[seq.length-1];
    out[name + 'range'] = seq[seq.length-1] - seq[0];

    return out;
}

function time_stats(wdlist) {
    // Analyze gaps
    let gaps = wdlist.filter((x) => x.type=='gap');

    let gap_distr = get_distribution(gaps.map((x) => x.end-x.start), 'gap_')

    let pgap = gaps.length / wdlist.length;

    // ...and durations
    let phones = wdlist.filter((x) => x.phones)
	.reduce((acc,x) => acc.concat(x.phones.map((p) => p.duration)), []);
    let phone_distr = get_distribution(phones, 'phone_');

    return Object.assign({pgap}, gap_distr, phone_distr);
}

function pitch_stats(seq) {

    let smoothed = smooth(seq);

    let velocity = derivative(smoothed);
    let acceleration = derivative(velocity);

    let pitched=seq.filter((p) => p>20);
    if(pitched.length==0) {
	return
    }

    let pitch_distr = get_distribution(pitched, 'pitch_');

    let acceled=acceleration.filter((p) => Math.abs(p)>0.1);
    let accel_distr = get_distribution(acceled, 'accel_');
    accel_distr['accel_norm'] = acceled.reduce((acc,x)=>acc+Math.abs(x),0) / acceled.length; // XXX: percentiles...

    return Object.assign({smoothed,
			  velocity,
			  acceleration},
			 pitch_distr, accel_distr);
}

function render_pitch(root, id, seq, attrs) {
    // Draw the entire pitch trace
    let ps = '';
    let started=false;
    seq
	.forEach((p,p_idx) => {
	    if(p > 0) {
		if(!started) {
		    ps += 'M ';
		}
		ps += '' + fr2x(p_idx) + ',' + (pitch2y(p)) + ' ';
		started=true;
	    }
	    else {
		started=false;
	    }
	});

    root.path({
	id: id,
	attrs: Object.assign({
	    d: ps,
	    'stroke-width': 1,
	    fill: 'none'
	}, attrs||{})
    });

}


function render_whiskers(root, id, stats, x1, x2) {
    root.rect({
	id: id + '-rect',
	attrs: {
	    x: x1,
	    y: Math.min(pitch2y(stats.pitch_percentile_9), pitch2y(stats.pitch_percentile_91)),
	    width: (x2-x1),
	    height: Math.abs(pitch2y(stats.pitch_percentile_9) - pitch2y(stats.pitch_percentile_91)),
	    stroke: 'rgba(0,0,0,0.5)',
	    fill: 'none'
	}
    });
    root.line({
	id: id + '-pitch_mean',
	attrs: {
	    x1: x1,
	    x2: x2,
	    y1: pitch2y(stats.pitch_mean),
	    y2: pitch2y(stats.pitch_mean),
	    stroke: 'rgba(255,0,0,0.4)',
	    fill: 'none'
	}
    });
}

function get_stat_keys(pstats) {
    return Object.keys(pstats)
	.filter((x) => typeof(pstats[x]) != 'object' && x != 'seg')
	.sort();
}

function render_overview(root) {
    if(!render_is_ready(root)) {
	return
    }

    let overview = root.div({id: 'oview', unordered: true});

    let width = document.body.clientWidth;
    let height = 50;

    let svg = root.svg({
	id: 'svg-overview',
	attrs: {
	    width: width,
	    height: height
	}
    });

    let align = get_cur_align();
    let duration = align.segments[align.segments.length-1].end;

    console.log("Duration", duration);

    align.segments
	.forEach((seg, seg_idx) => {
	    seg.wdlist.forEach((wd,wd_idx) => {
		if(!wd.end) { return }

		if(wd.type == 'gap'){
		    svg.rect({id: 'gap-' + seg_idx + '-' + wd_idx,
			      attrs: {
				  x: width * (wd.start/duration),
				  y: 0,
				  width: width * (wd.end-wd.start) / duration,
				  height: height,
				  fill: 'rgba(0,0,0,0.1)'
			      }})
		}
		else {
		    // Word

		    // Compute word-pitch
		    let wd_pitch = get_cur_pitch()
			.slice(Math.floor(wd.start * 100), Math.floor(wd.end * 100));

		    console.log('wd_pitch', wd_pitch);

		    let pitch_mean = (pitch_stats(wd_pitch) || {})['pitch_mean'];
		    if(pitch_mean) {

		    let y = height - ((pitch_mean - 50) / 400) * height;

		    svg.rect({id: 'word-' + seg_idx + '-' + wd_idx,
			      attrs: {
				  x: width * (wd.start/duration),
				  y: y,
				  width: width * (wd.end-wd.start) / duration,
				  height: 3,
				  fill: 'rgba(0,0,200,0.8)'
			      }})
		    }
		}
	    })
	});
}



function render_segs_ss(root, head) {
    if(!render_is_ready(root)) {
	return
    }

    let sheet = root.div({id: 'ss', unordered: true});

    // Global data.
    let pstats = pitch_stats(get_cur_pitch());

    Object.assign(pstats, time_stats(get_cur_align().segments.reduce((acc,x) => acc.concat(x.wdlist), [])));

    let cur_y = 0;
    const stat_keys = get_stat_keys(pstats);

    stat_keys
	.forEach((key, col_idx) => {
	    // Header
	    sheet.div({id: 'h-' + key,
		       text: key,
		       classes: ['header', 'cell'],
		       styles: {
			   left: col_idx*150,
			   top: 0,
			   width: 150,
			   height: 20
		       }})
	    // global
	    let fval = Math.round(100 * pstats[key]) / 100;

	    sheet.div({id: 'gv-' + key,
		       text: '' + fval,
		       classes: ['cell', 'global'],
		       styles: {
			   left: col_idx*150,
			   top: 20,
			   width: 150,
			   height: 20
		       }})
	})
    cur_y += 40;

    // Dump segs
    get_cur_align().segments
	.forEach((seg, seg_idx) => {

	    sheet.div({
		id: 'segtxt-' + seg_idx,
		text: seg.wdlist.filter((x) => x.type != 'gap').map((x) => x.word).join(''),
		classes: ['cell', 'txt'],
		styles: {
		    top: cur_y+10
		},
		events: {
		    onclick: (ev) => {
			T.SHOW_SEGS = T.SHOW_SEGS||{};
			T.SHOW_SEGS[seg_idx] = !T.SHOW_SEGS[seg_idx];
			render();
		    }
		}
	    })
	    cur_y += 30;

	    let sstats = pitch_stats(get_cur_pitch().slice(Math.round(seg.start*100), Math.round(seg.end*100)));

	    Object.assign(sstats, time_stats(seg.wdlist));

	    stat_keys
		.forEach((key, col_idx) => {
		    let fval = Math.round(100 * sstats[key]) / 100;
		    if(isNaN(fval)) { fval = '' }

		    sheet.div({id: 'sv-' + seg_idx + '-' + key,
			       text: '' + fval,
			       classes: ['cell'],
			       styles: {
				   left: col_idx*150,
				   top: cur_y,
				   width: 150,
				   height: 20
			       }})
		});
	    cur_y += 20;

	    if((T.SHOW_SEGS||{})[seg_idx]) {
		render_seg(sheet.div({id: 'seg-view-' + seg_idx,
				      classes: ['cell'],
				      styles: {
					  top: cur_y
				      }}),
			   seg, seg_idx);
		cur_y += T.PITCH_H;
	    }

	});
}

function render_segs(root, head) {
    if(!render_is_ready(root)) {
	return
    }
    get_cur_align().segments.forEach((seg, seg_idx) => {
	render_seg(root, seg, seg_idx);
    })

}

function render_seg(root, seg, seg_idx) {
    const seg_w = t2x(seg.end - seg.start);

    let svg = root.svg({
	id: 'svg-' + seg_idx,
	attrs: {
	    width: seg_w,
	    height: T.PITCH_H
	},
	events: {
	    onclick: () => {
		window.a = new Audio('/media/' + T.docs[T.cur_doc].path);//
		window.setTimeout(() => {
		    window.a.currentTime = seg.start-1;
		    window.a.play();
		}, 200)
		//    + '#t=' + seg.start + ',' + (seg.end-seg.start));
		//a.play()
	    }
	}
    });

    // Draw axes
    var y_axes = [50, 100, 150, 200, 250, 300, 350, 400];
    y_axes.forEach((yval) => {
        var y_px = pitch2y(yval);

	svg.line({id: 'seg-' + seg_idx + '-axis-' + yval,
		  attrs: {
		      x1: 0,
		      y1: y_px,
		      x2: seg_w,
		      y2: y_px,
		      stroke: '#C4D5D9'
		  }})
	svg.text({id: 'seg-' + seg_idx + '-axistxt-' + yval,
		  text: '' + yval + 'Hz',
		  attrs: {
		      x: 0,
		      y: y_px,
		      class: 'axis',
		      fill: '#3B5161'
		  }})

    });

    let seq_stats = pitch_stats(
	get_cur_pitch().slice(Math.round(seg.start*100),
			  Math.round(seg.end*100)));

    // render_whiskers(svg, 'segwhisk-' + seg_idx,
    // 		    seq_stats, T.LPAD, seg_w);


    render_pitch(
	svg, 'spath-' + seg_idx,
	get_cur_pitch().slice(Math.round(seg.start*100),
			  Math.round(seg.end*100)),
	{
	    stroke: '#CCBDED',
	    'stroke-width': 1,
	}
    );

    render_pitch(
	svg, 'sspath-' + seg_idx,
	seq_stats.smoothed,
	{
	    stroke: '#8D78B9',
	    'stroke-width': 3,
	}
    );

    // Draw acceleration
    // seq_stats.acceleration
    // 	.forEach((a, a_idx) => {
    // 	    if(Math.abs(a) > 0.05) {

    // 		let h = (a/T.MAX_A) * T.PITCH_H;
    // 		let cy = pitch2y(seq_stats.smoothed[a_idx]);

    // 		svg.line({id: 'a-' + a_idx,
    // 			  attrs: {
    // 			      x1: fr2x(a_idx),
    // 			      y1: cy,
    // 			      x2: fr2x(a_idx),
    // 			      y2: cy - h,
    // 			      stroke: '#FFBA08'
    // 			  }});

    // 	    }
    // 	});

    // Draw amplitude
    get_cur_rms()
	.slice(Math.round(seg.start*100),
	       Math.round(seg.end*100))
	.forEach((r, r_idx) => {

	    let h = r * T.PITCH_H/5;
	    let cy = 9.25/10 * T.PITCH_H;

	    svg.line({id: 'rms-' + seg_idx + '-' + r_idx,
		      attrs: {
			  x1: fr2x(r_idx),
			  y1: cy - (h/2),
			  x2: fr2x(r_idx),
			  y2: cy + (h/2),
			  stroke: 'black',
			  'stroke-width': 2,
		      }})
	});

    // Draw each word
    seg.wdlist.forEach((wd,wd_idx) => {

	if(!wd.end) { return }

	if(wd.type == 'gap'){
	    svg.rect({id: 'gap-' + seg_idx + '-' + wd_idx,
		      attrs: {
			  x: t2x(wd.start-seg.start),
			  y: 0,
			  width: t2w(wd.end-wd.start),
			  height: T.PITCH_H,
			  fill: 'rgba(0,0,0,0.05)'
		      }})

	    return
	}

	let wd_stats = pitch_stats(get_cur_pitch().slice(Math.round(wd.start*100),
						     Math.round(wd.end*100)));

	// if(wd_stats) {
	//     render_whiskers(svg, 'wdwhisk-' + seg_idx + '-' + wd_idx,
	// 		    wd_stats,
	// 		    t2x(wd.start - seg.start),
	// 		    t2x(wd.end - seg.start))
	// }

	svg.text({id: 'txt-' + seg_idx + '-' + wd_idx,
		  text: wd.word,
		  attrs: {
		      class: wd.type=='unaligned' ? 'unaligned' : 'word',
		      x: t2x(wd.start - seg.start),
		      //y: pitch2y((wd_stats&&wd_stats.pitch_mean) || seq_stats.pitch_mean) - 2,
		      y: pitch2y((wd_stats&&wd_stats.pitch_percentile_91) || seq_stats.pitch_mean) - 2,
		      fill: '#3B5161',
		  }
		 })
    });
}

function render_is_ready(root) {
    if(!T.docs[T.cur_doc]) {
        new PAL.Element("div", {
            parent: root,
            text: "Loading..."
        });
        return;
    }

    return get_data(T.cur_doc);
}

function render() {

    var root = new PAL.Root();

    let head = render_header(root);

    if(T.cur_doc) {

	render_overview(root);

        //render_doc(root, head);
	//render_segs(root, head);
	render_segs_ss(root);
    }
    else {
        render_uploader(root);
        render_doclist(root);
    }

    root.show();

    if(T.cur_doc) {
        if(T.wd_can) {
            blit_wd_can();
        }
        if(T.graph_can) {
            blit_graph_can();
        }
    }

}

    function blit_wd_can() {
	return;

    var $can = T.wd_can.$el;

    // Compute word positions
    T.wd_pos = {};

    var wd_right_max = 0;
    var wd_top_max = 0;

    Object.keys(T.wd_els)
        .forEach((wd_idx) => {
            var pos = {
                left: T.wd_els[wd_idx].$el.offsetLeft,
                width: T.wd_els[wd_idx].$el.offsetWidth,
                top: T.wd_els[wd_idx].$el.offsetTop
            };

            T.wd_pos[wd_idx] = pos;

            wd_right_max = Math.max(pos.left+pos.width, wd_right_max);
            wd_top_max = Math.max(pos.top, wd_top_max);
        });

    // Size canvas to fit all the words
    $can.setAttribute("width", wd_right_max);
    $can.setAttribute("height", wd_top_max+60);

    var ctx = $can.getContext('2d');

    get_cur_align().words.forEach(function(w, w_idx) {
        if(w_idx in T.wd_pos) {
            render_waveform(ctx, w, T.wd_pos[w_idx]);
        }
    });
}

function blit_graph_can() {
    var $can = T.graph_can.$el;

    var w = document.body.clientWidth/2;
    var h = document.body.clientHeight/2;

    $can.setAttribute('width', w);
    $can.setAttribute('height', h*1.25);
    // $can.setAttribute('width', w);
    // $can.setAttribute('height', h*1.25);


    var ctx = $can.getContext('2d');

    var nsecs = 0.1 + (T.cur_zoom||0.5)*30;

    var cur_t = T.cur_t || T.audio_el.$el.currentTime || 0;

    var start = Math.max(0, cur_t - nsecs/2);
    var end = start+nsecs;
    T.graph_start = start;
    T.graph_end = end;

    render_waveform(ctx, {start:start, end:end}, {left: 0, top: 0, width: w, height: h}, h);

    // Draw axes
    var y_axes = [50, 100, 150, 200, 250, 300, 350, 400];
    y_axes.forEach((yval) => {
        var y_px = pitch2y(yval, h);

        ctx.fillStyle = "#CFD8DC";
        ctx.fillRect(0, y_px, w, 1);

        ctx.fillStyle = "#90A4AE";
        ctx.fillText("" + yval + "Hz", 0, y_px-1);
    });

    var graph_end_y = pitch2y(50, h);

    for(var t=Math.ceil(start); t<Math.ceil(end); t++) {

        var x_px = w * ((t-start) / (end-start));

        ctx.fillStyle = "#CFD8DC";
        ctx.fillRect(x_px, 0, 1, graph_end_y);

        ctx.fillStyle = "#90A4AE";
        ctx.fillText("" + t + "s", x_px-5, graph_end_y+10);
    }

    var wd_start_y = pitch2y(75, h);

    // Draw in-view words, in-time
    if(get_cur_align()) {
        get_cur_align().segments.forEach((seg) => {
	    seg.wdlist.forEach((wd) => {
		if(!wd.end || wd.start >= end || wd.end <= start) {
                    return;
		}

		var x = w * ((wd.start - start) / (end-start));

		ctx.fillStyle = "#263238";
		ctx.font = "14pt Arial";
		ctx.fillText(wd.word, x, wd_start_y)

		wd.phones.forEach((ph) => {

                    ctx.fillStyle = "#B0BEC5";
                    ctx.font = "10pt Arial";
                    ctx.fillText(ph.phone.split("_")[0], x, wd_start_y+20)

                    var ph_w = w * (ph.duration / (end-start));

                    ctx.fillRect(x, wd_start_y+5, ph_w, 2);

                    x += ph_w;
		});
	    });
        })
    }

    // ...Finally, a playhead
    ctx.fillStyle = "#E85C41";
    //ctx.fillStyle = "red";
    ctx.fillRect(w * ((cur_t-start)/(end-start)), 0, 1, graph_end_y);
}


function render_waveform(ctx, w, rect, p_h) {
    if(!w.end || !get_cur_pitch()) {
        return;
    }

    // // Draw waveform
    var st_idx = Math.floor(w.start * 100);
    var end_idx = Math.ceil(w.end * 100);
    var step = rect.width / (end_idx - st_idx);

    var x = rect.left;
    var y = rect.top;
    var y_off = 2;

    // ctx.beginPath();
    // ctx.moveTo(x, y + y_off + 30 - data.rms[st_idx]*30);
    // for(var i=st_idx+1; i<=end_idx; i++) {
    //     ctx.lineTo(x + (i-st_idx)*step, y + y_off + 30 - data.rms[i]*30);
    // }
    // for(var i=end_idx; i>=st_idx; i--) {
    //     ctx.lineTo(x + (i-st_idx)*step, y + y_off + 30 + data.rms[i]*30);
    // }
    // ctx.fill();

    // ctx.beginPath();
    // Draw pitch trace
    ctx.strokeStyle = "#449A88";
    ctx.lineWidth = 1;

    var offset = 0;
    while(!get_cur_pitch()[st_idx+offset]) {
        offset += 1
        if(offset >= get_cur_pitch().length) {
            break;
        }
    }

    var in_line = false;
    for(var i=st_idx; i<=end_idx; i++) {
        if(get_cur_pitch()[i]) {
            if(!in_line) {
                ctx.beginPath();
                ctx.moveTo(x + (i-st_idx)*step, y + y_off + pitch2y(get_cur_pitch()[i], p_h));
                //ctx.moveTo(x + offset*step, y + y_off + pitch2y(get_cur_pitch()[st_idx+offset], p_h));
                in_line = true;
            }
            else {
                ctx.lineTo(x + (i-st_idx)*step, y + y_off + pitch2y(get_cur_pitch()[i], p_h));
            }
        }
        else {
            if(in_line) {
                ctx.stroke();
            }
            in_line = false;
        }
    }
    if(in_line) {
        ctx.stroke();
    }
}

function fr2x(fr) {
    return t2x(fr/100.0);
}
function t2x(t) {
    return T.LPAD + t2w(t);
}
function t2w(t) {
    return t*T.XSCALE;
}


function pitch2y(p, p_h) {
    if(p == 0) {
        return p;
    }

    // -- Linear
    //return T.PITCH_H - p;

    // -- Logscale
    // This is the piano number formula
    // (https://en.wikipedia.org/wiki/Piano_key_frequencies)
    // n = 12 log2(f/440hz) + 49
    return (-50 * Math.log2(p / 440));
}

window.onhashchange = () => {
    var docid = window.location.hash.slice(1);
    console.log("hash", docid, window);

    if(docid in T.docs) {
	T.SHOW_SEGS={};
        T.cur_doc = docid;
    }
    else if(docid) {
        window.location.hash = "";
        return;
    }
    else {
        T.cur_doc = undefined;
    }
    render();
}


render();
