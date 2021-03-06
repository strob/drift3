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
function get_cur_pitch(id) {
    return (get_data(id || T.cur_doc)||{}).pitch
}
function get_cur_align(id) {
    return (get_data(id || T.cur_doc)||{}).align
}
function get_cur_rms(id) {
    return (get_data(id || T.cur_doc)||{}).rms
}

function has_data(docid) {
    let meta = T.docs[docid];
    if(!meta) { return }

    return meta.pitch && meta.align && meta.rms;
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
if(!T.active) {
    T.active = {};
}
if(!T.razors) {
    T.razors = {};
}
if(!T.selections) {
    T.selections = {};
}
function reload_docs() {
    T.LAST_T = T.LAST_T || 0;
    let firsttime = !T.LAST_T;

    FARM.get_json("/_rec/_infos.json?since=" + T.LAST_T, (ret) => {
	      ret.forEach((doc) => {
            T.docs[doc.id] = doc;
	          T.LAST_T = Math.max(T.LAST_T, doc.modified_time);
	      });
        render();

	      window.setTimeout(reload_docs, 3000);
    });
}


function get_docs() {
    return Object.keys(T.docs)
        .map((x) => Object.assign({}, T.docs[x], {id: x}))
        .sort((x,y) => x.date > y.date ? -1 : 1);
}
function set_active_doc(doc) {
    if(doc.id !== T.cur_doc) {
	      T.cur_doc = doc.id;
	      T.audio = new Audio('/media/' + doc.path);
    }
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
                                console.log("pitch returned", p_ret);
                            });

			                      // ...and RMS
			                      FARM.post_json("/_rms", {id: ret.id}, (c_ret) => {
				                        console.log("rms returned", c_ret);
			                      });

                        });

                    }, function(p, cur_uploading) {
                        T.docs[ret.id].upload_status = p / ret.size;
                        console.log("upload_status", T.docs[ret.id].upload_status);
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

	          // doc ready!!

	          let is_active = T.active[doc.id];
            let is_pending = !has_data(doc.id);

	          let docitem = root.div({id: doc.id,
				                            //text: doc.title,
				                            classes: ['driftitem', is_pending ? 'pending' : (is_active ? 'active' : 'ready')]
				                           });


	          // Top bar
	          let docbar = docitem.div({id: doc.id + "-bar",
				                              classes: ['docbar'],
				                              events: {
					                                onclick: () => {
					                                    if(has_data(doc.id)) {
						                                      T.active[doc.id] = !T.active[doc.id];
						                                      set_active_doc(doc);
						                                      render();
					                                    }
					                                }
				                              }
				                             });

	          // Expand
	          docbar.span({id: doc.id + '-expand',
			                   classes: ['expand'],
			                   text: is_active||is_pending ? "v " : "> "});

	          // Title
	          docbar.span({id: doc.id + '-name',
			                   classes: ['name'],
			                   text: doc.title});


	          if(doc.upload_status && !doc.path) {
                // Show progress
                new PAL.Element("progress", {
	          		    id: doc.id + '-progress',
	          		    parent: docbar,
	          		    attrs: {
                        max: "100",
                        value: "" + Math.floor((100*doc.upload_status))
	          		    },
                })
	          }

	          if(doc.align_px && !doc.align) {
                // Show progress
                new PAL.Element("progress", {
	          		    id: doc.id + '-align-progress',
	          		    parent: docbar,
	          		    attrs: {
                        max: "100",
                        value: "" + Math.floor((100*doc.align_px))
	          		    },
                })
            }

	          // Hamburger
	          docbar.div({id: doc.id + '-hamburger',
			                  text: ":",
			                  events: {
			                      onclick: (ev) => {
				                        console.log("hamclick");
				                        ev.preventDefault();
				                        ev.stopPropagation();

				                        T.SHOW_HAMBURGER = {
				                            $el: ev.target,
				                            doc: doc
				                        };
				                        render();

				                        window.onclick = (ev) => {
				                            T.SHOW_HAMBURGER = null;
				                            render();
				                            window.onclick = null;
				                        }

			                      }
			                  },
			                  classes: ['hamburger']})

            if(is_pending) {
                render_paste_transcript(docitem, doc.id);
            }
	          else if(is_active) {
		            // Expand.

                render_stats(docitem, doc);

                if(true) {//T.cur_doc == doc.id) {
                // a play button!
                docitem.button({id: doc.id + '-' + 'play',
                                classes: ['playbutton'],
                                events: {
                                    onclick: () => {
                                        T.cur_doc = doc.id;
                                        toggle_playpause();
                                    }
                                },
                                text: (T.audio && T.audio.paused) ? 'play' : 'pause'})
                }

		            let ov_div = docitem.div({
		                id: doc.id + '-ovdiv',
		                classes: ['overview']
		            });
		            render_overview(ov_div, doc);

		            let det_div = docitem.div({
		                id: doc.id + '-detdiv',
		                classes: ['detail']
		            });

		            if(!(doc.id in T.selections)) {
		                T.selections[doc.id] = {start_time: 0, end_time: 20};
		            }

		            render_detail(det_div, doc, T.selections[doc.id].start_time, T.selections[doc.id].end_time);

                if(!T.DRAGGING) {
                    docitem.i({id: doc.id + '-expl', text: 'selected region:'})
                    render_stats(docitem, doc, T.selections[doc.id].start_time, T.selections[doc.id].end_time);
                }

	          }


	      })
}
function render_stats(root_, doc, start, end) {
    let root = root_.div({id: 'mwrap-' + start + '-' + doc.id, classes: ['stats']});

    let url = '/_measure?id=' + doc.id;
    if(start) {
        url += '&start_time=' + start;
    }
    if(end) {
        url += '&end_time=' + end;
    }

    let stats = cached_get_url(url, JSON.parse).measure;
    if(stats) {
        let uid = doc.id + '-' + start + '-' + end;

        let statbar = root.div({id: 'sb-'+ uid, classes: ['sbar']});

        let keys = Object.keys(stats)
            .sort();

        const cell_w = 100;

        // Header
        keys
            .forEach((key,idx) => {
                statbar.div({
                    id: 'sb-h-' + uid + '-' + key,
                    classes: ['sb', 'cell', 'header'],
                    styles: {
                        left: cell_w*idx,
                        width: cell_w
                    },
                    attrs: {
                        title: key.replace(/_/g, ' ')
                    },
                    text: key.replace(/_/g, ' ')
                });
            })

        keys
            .forEach((key,idx) => {
                statbar.div({
                    id: 'sb-' + uid + '-' + key,
                    classes: ['sb', 'cell'],
                    styles: {
                        left: cell_w*idx,
                        top: 20,
                        width: cell_w
                    },
                    text: '' + Math.round(stats[key] * 100) / 100
                });
            });

        let cspan = root.div({id: uid + '-cspan', styles: {textAlign: 'center'}});
        cspan.button({id: uid + '-scopy',
                     classes: ['copybutton'],
                        text: 'copy data',
                        events: {
                            onclick: (ev) => {
                                let cliptxt = '';
                                keys.forEach((key) =>{
                                    cliptxt += key + '\t';
                                });
                                cliptxt += '\n';
                                keys.forEach((key) =>{
                                    cliptxt += stats[key] + '\t';
                                });
                                cliptxt += '\n'

                                // Create, select, copy, and remove a textarea.
                                let $el = document.createElement('textarea');
                                $el.textContent = cliptxt;
                                document.body.appendChild($el);
                                $el.select();
                                document.execCommand("copy");
                                document.body.removeChild($el);
                            }
                        }
                       });
    }

}

function render_paste_transcript(root, docid) {

    root.div({
        id: "ptrans-" + docid,
        classes: ['paste'],
        text: "paste in a transcript to continue"
    });

    root.textarea({
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

                // prevent dual-submission...
                this.disabled = true;
                this.textContent = "aligning transcript...";

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

				                        // Trigger CSV & MAT computation (assuming pitch also there)
				                        FARM.post_json("/_csv", {id: docid}, (c_ret) => {
				                            console.log("csv returned");
				                        });
				                        FARM.post_json("/_mat", {id: docid}, (c_ret) => {
				                            console.log("mat returned");
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

function render_detail(root, doc, start_time, end_time) {
    if(!render_is_ready(root)) {
	      return
    }

    let segs = get_cur_align(doc.id).segments;
    end_time = Math.min(end_time, segs[segs.length-1].end);
    let duration = end_time - start_time;

    const seg_w = t2x(duration);

    let svg = root.svg({
	      id: doc.id + '-svg-',
	      attrs: {
	          width: seg_w,
	          height: T.PITCH_H
	      },
	      events: {
	          onclick: (ev) => {
		            ev.preventDefault();

		            // Seek!
		            let t = start_time + x2t(ev.clientX + svg.$el.parentElement.scrollLeft);
		            T.razors[doc.id] = t;
		            set_active_doc(doc);
		            T.audio.currentTime = t;
		            render();
	          }
	      }
    });

    // Draw axes
    var y_axes = [50, 100, 150, 200, 250, 300, 350, 400, 450];
    y_axes.forEach((yval) => {
        var y_px = pitch2y(yval);

	      svg.line({id: doc.id + '-seg-' + '-axis-' + yval,
		              attrs: {
		                  x1: 0,
		                  y1: y_px,
		                  x2: seg_w,
		                  y2: y_px,
		                  stroke: '#C4D5D9'
		              }})
        if(!(yval in {150: true, 250: true, 300: true, 350: true})) {
	          svg.text({id: doc.id + '-seg-' + '-axistxt-' + yval,
		                  text: '' + yval + 'Hz',
		                  attrs: {
		                      x: 0,
		                      y: y_px,
		                      class: 'axis',
		                      fill: '#3B5161'
		                  }})
        }
    });

    // ...and x-axis
    for(let x=Math.ceil(start_time); x<end_time; x++) {
        var x_px = t2x(x - start_time);

	      svg.line({id: doc.id + '-seg-' + '-xaxis-' + x,
		              attrs: {
		                  x1: x_px,
		                  y1: 0,
		                  x2: x_px,
		                  y2: T.PITCH_H,
		                  stroke: '#C4D5D9'
		              }})
	      svg.text({id: doc.id + '-seg-' + '-xaxistxt-' + x,
		              text: '' + x + 's',
		              attrs: {
		                  x: x_px + 2,
		                  y: T.PITCH_H - 2,
		                  class: 'axis',
		                  fill: '#3B5161'
		              }})
    }

    let seq_stats = pitch_stats(
	      get_cur_pitch(doc.id).slice(Math.round(start_time*100),
				                            Math.round(end_time*100)));

    render_pitch(
	      svg, doc.id + '-spath-',
	      get_cur_pitch(doc.id).slice(Math.round(start_time*100),
				                            Math.round(end_time)),
	      {
	          stroke: '#CCBDED',
	          'stroke-width': 1,
	      }
    );

    if(seq_stats) {
	      render_pitch(
	          svg, doc.id + '-sspath-',
	          seq_stats.smoothed,
	          {
		            stroke: '#8D78B9',
		            'stroke-width': 3,
	          }
	      );
    }

    // Draw amplitude
    get_cur_rms(doc.id)
	      .slice(Math.round(start_time*100),
	             Math.round(end_time*100))
	      .forEach((r, r_idx) => {

	          let h = r * T.PITCH_H/5;
	          let cy = 9.25/10 * T.PITCH_H;

	          svg.line({id: doc.id + '-rms-'  + '-' + r_idx,
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
    segs.forEach((seg, seg_idx) => {
	      seg.wdlist.forEach((wd,wd_idx) => {

	          if(!wd.end) { return }

	          if(wd.start >= end_time || wd.end <= start_time) { return; }

	          if(wd.type == 'gap'){
		            svg.rect({id: doc.id + '-gap-' + seg_idx + '-' + wd_idx,
			                    attrs: {
			                        x: t2x(wd.start - start_time),
			                        y: 0,
			                        width: t2w(wd.end - wd.start),
			                        height: T.PITCH_H,
			                        fill: 'rgba(0,0,0,0.05)'
			                    }})

		            return
	          }

	          let wd_stats = pitch_stats(get_cur_pitch(doc.id).slice(Math.round(wd.start*100),
								                                                   Math.round(wd.end*100)));

	          svg.text({id: doc.id + '-txt-' + seg_idx + '-' + wd_idx,
		                  text: wd.word,
		                  attrs: {
			                    class: wd.type=='unaligned' ? 'unaligned' : 'word',
			                    x: t2x(wd.start - start_time),
			                    //y: pitch2y((wd_stats&&wd_stats.pitch_mean) || seq_stats.pitch_mean) - 2,
			                    y: Math.max(30, pitch2y((wd_stats&&wd_stats.pitch_percentile_91) || seq_stats.pitch_mean) - 2),
			                    fill: '#3B5161',
		                  }
		                 })
	      });
    });


    if(T.cur_doc == doc.id && T.razors[doc.id]) {
	      svg.rect({id: doc.id + '-d-razor',
		              attrs: {
		                  x: t2x(T.razors[doc.id] - start_time),
		                  y: 0,
		                  width: 2,
		                  height: T.PITCH_H,
		                  fill: 'red'
		              }
		             });
    }

}

function render_overview(root, doc) {
    if(!render_is_ready(root)) {
	      return
    }

    let overview = root.div({id: doc.id + '-oview', unordered: true});

    let width = document.body.clientWidth;
    let height = 50;

    let align = get_cur_align(doc.id);
    let duration = align.segments[align.segments.length-1].end;

    let svg = root.svg({
	      id: doc.id + '-svg-overview',
	      attrs: {
	          width: width,
	          height: height
	      },
	      events: {
	          onmousedown: (ev) => {
		            ev.preventDefault();

		            // Compute time for razor (XXX: make selection?)
		            let t1 = (ev.clientX / width) * duration;
		            let t2 = t1;

                T.DRAGGING = true;

		            window.onmousemove = (ev) => {
		                t2 = (ev.clientX / width) * duration;

		                if(Math.abs(t2 - t1) > 0.2) {

			                  let start = Math.min(t1, t2);
			                  let end = Math.max(t1, t2);

			                  // Limit to 30secs
			                  end = Math.min(start+30, end);

			                  T.selections[doc.id] = {
			                      start_time: start,
			                      end_time: end
			                  };

			                  render();
		                }
		                else {
			                  // if(doc.id in T.selections) {
			                  //     delete T.selections[doc.id];
			                  //     render();
			                  // }
		                }

		            }
		            window.onmouseup = (ev) => {
                    T.DRAGGING = false;

		                set_active_doc(doc);

		                if(Math.abs(t2 - t1) < 0.2) {
			                  // TODO: Seek audio
			                  T.razors[doc.id] = t2;
			                  T.audio.currentTime = t2;

		                }
			              render();

		                window.onmousemove = null;
		                window.onmouseup = null;
		            };
	          }
	      }
    });

    align.segments
	      .forEach((seg, seg_idx) => {
	          seg.wdlist.forEach((wd,wd_idx) => {
		            if(!wd.end || !wd.start) { return }

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
		                let wd_pitch = get_cur_pitch(doc.id)
			                  .slice(Math.floor(wd.start * 100), Math.floor(wd.end * 100));

		                // console.log('wd_pitch', wd_pitch);

		                let pitch_mean = (pitch_stats(wd_pitch) || {})['pitch_mean'];
		                if(pitch_mean) {

			                  let y = pitch2y(pitch_mean)/5;//height - ((pitch_mean - 50) / 400) * height;

			                  svg.rect({id: doc.id + '-word-' + seg_idx + '-' + wd_idx,
				                          attrs: {
				                              x: width * (wd.start/duration),
				                              y: y,
				                              width: width * (wd.end-wd.start) / duration,
				                              height: 2,
				                              fill: 'rgba(0,0,200,0.3)'
				                          }})
		                }
		            }
	          })
	      });

    if(T.selections[doc.id]) {
	      let sel = T.selections[doc.id];

	      svg.rect({id: doc.id + '-o-selection',
		              attrs: {
		                  x: width * (sel.start_time / duration),
		                  y: 0,
		                  width: width * ((sel.end_time - sel.start_time) / duration),
		                  height: height,
		                  stroke: 'black',
		                  'stroke-width': 2,
		                  fill: 'none'
		              }
		             });
    }

    if(T.cur_doc == doc.id && T.razors[doc.id]) {
	      svg.rect({id: doc.id + '-o-razor',
		              attrs: {
		                  x: width * (T.razors[doc.id] / duration),
		                  y: 0,
		                  width: 2,
		                  height: height,
		                  fill: 'red'
		              }
		             });
    }

    // ...and x-axis
    let last_x = 0;

    for(let x=0; x<duration; x+=1) {
        let show_secs = false;

        var x_px = width * (x/duration);
        if(x % 5 == 0 && x - last_x > 10) {
            last_x = x;
            show_secs = true;
        }
	      svg.line({id: doc.id + '-ov-' + '-xaxis-' + x,
		              attrs: {
		                  x1: x_px,
		                  y1: height,
		                  x2: x_px,
		                  y2: height - (show_secs ? 10 : 5),
		                  stroke: '#C4D5D9'
		              }})
        if(show_secs) {
	          svg.text({id: doc.id + '-ov-' + '-xaxistxt-' + x,
		                  text: '' + x + 's',
		                  attrs: {
		                      x: x_px + 2,
		                      y: height - 2,
		                      class: 'axis',
		                      fill: '#3B5161'
		                  }})
        }
    }

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

function delete_action(doc) {
    FARM.post_json("/_rec/_remove", {id: doc.id}, (ret) => {
	      delete T.docs[ret.remove];
	      render();
    });
}


function render_hamburger(root, doc) {
    let ham = root.div({id: 'hamburger',
			                  styles: {
			                      top: T.SHOW_HAMBURGER.$el.parentElement.parentElement.offsetTop
			                  },
			                  //text: 'ham'
		                   });

    let pregen_downloads = ['csv', 'mat', 'align', 'pitch'];
    pregen_downloads.forEach((name) => {
        if(!doc[name]) {
            return;
        }
        let out_filename = doc.title.split('.')[0] + '-' + name + '.' + doc[name].split('.')[1];

	      ham.a({
	          id: 'ham-' + name,
	          text: name,
            attrs: {
                href: '/media/' + doc[name],
                _target: '_blank',
                download: out_filename
            }
	      });
    });


    let actions = ['delete'];
    actions.forEach((name) => {
	      ham.div({
	          id: 'ham-' + name,
	          text: name,
	          events: {
		            onclick: (ev) => {
		                console.log("click", name);
                    window[name + '_action'](doc);
		            }
	          }
	      });
    });
}

function render() {
    var root = new PAL.Root();

    let head = render_header(root);

    render_uploader(root);
    render_doclist(root);

    if(T.SHOW_HAMBURGER) {
	      render_hamburger(root, T.SHOW_HAMBURGER.doc);
    }

    root.show();
}

function fr2x(fr) {
    return t2x(fr/100.0);
}
function t2x(t) {
    return T.LPAD + t2w(t);
}
function x2t(x) {
    return (x - T.LPAD)/T.XSCALE;
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
    return (-60 * Math.log2(p / 440));
}
function toggle_playpause() {
	  if(T.audio) {
	      if(T.audio.paused) {
		        T.audio.play();
	      }
	      else {
		        T.audio.pause();
	      }
        render();
	  }
}
window.onkeydown = (ev) => {
    // XXX: Make sure we're not editing a transcript.
    if(ev.target.tagName == 'TEXTAREA') {
        return;
    }
    if(ev.key == ' ') {
	      ev.preventDefault();
        toggle_playpause();
    }
}

function tick() {
    if(T.audio && !T.audio.paused) {
	      T.razors[T.cur_doc] = T.audio.currentTime;
	      render();
    }

    window.requestAnimationFrame(tick);
}

if(!T.ticking) {
    T.ticking = true;
    tick();
}


render();
