var T = T || {};
T.XSCALE = 250;
T.PITCH_H= 500;
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

            var doc_has_everything = doc.path && doc.transcript;
            
            var docel = new PAL.Element("div", {
                parent: root,
                id: "item-" + doc.id,
                classes: ['listitem', doc_has_everything ? 'ready' : 'pending'],
                events: {
                    onclick: () => {
                        if(doc.path && doc.transcript) {
                            window.location.hash = doc.id;
                        }
                    }
                }
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
        });
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

function doc_update() {
    // Check if this update makes a document somehow ... ready, in which case we load some things.
    if(!T.doc_ready) {
        var meta = T.docs[T.cur_doc];

        if(meta.pitch && meta.align && meta.path) {
            T.doc_ready = true;

            FARM.get('media/' + meta.pitch, (pitch) => {
                // parse ellis pitch
                T.cur_pitch = pitch.split('\n')
                    .filter((x) => x.length > 5)
                    .map((x) => Number(x.split(' ')[1]));

                var max_pitch = 0;
                var min_pitch = 0;
                T.cur_pitch.forEach(function(x) {
                    if(x > max_pitch) {
                        max_pitch = x;
                    }
                    if(x > 0 && (x < min_pitch || min_pitch == 0)) {
                        min_pitch = x;
                    }
                });
                T.MIN_PITCH = min_pitch;
                T.PITCH_SC = 1 / (max_pitch - min_pitch);

                render();
            });
            FARM.get_json('media/' + meta.align, (align) => {
                T.cur_align = align;

                render();
            });
        }
    }

    render();
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

function pitch_stats(seq, seg) {

    let smoothed = smooth(seq);

    let velocity = derivative(smoothed);
    let acceleration = derivative(velocity);

    let pitched=seq.filter((p) => p>20);
    if(pitched.length==0) {
	return
    }

    let mean=pitched.reduce((acc,x)=>acc+x,0) / pitched.length;
    pitched.sort((x,y) => x > y ? 1 : -1);
		 
    let p9 = pitched[Math.floor(pitched.length * 0.09)];
    let p91 = pitched[Math.floor(pitched.length * 0.91)];
    let p2 = pitched[Math.floor(pitched.length * 0.02)];
    let p98 = pitched[Math.floor(pitched.length * 0.98)];

    return {smoothed, mean,
	    p9, p91, p2, p98,
	    velocity, acceleration,
	    seg};
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
	    y: Math.min(pitch2y(stats.p9), pitch2y(stats.p91)),
	    width: (x2-x1),
	    height: Math.abs(pitch2y(stats.p9) - pitch2y(stats.p91)),
	    stroke: 'rgba(0,0,0,0.5)',
	    fill: 'none'
	}
    });
    root.line({
	id: id + '-mean',
	attrs: {
	    x1: x1,
	    x2: x2,
	    y1: pitch2y(stats.mean),
	    y2: pitch2y(stats.mean),	    
	    stroke: 'rgba(255,0,0,0.4)',
	    fill: 'none'
	}
    });    
}

function render_segs(root, head) {
    if(!render_is_ready(root)) {
	return
    }

    var meta = T.docs[T.cur_doc];

    T.cur_align.segments.forEach((seg, seg_idx) => {

	render_seg(root, seg, seg_idx);
    })

}

function render_seg(root, seg, seg_idx) {

    // let segel = root.div({
    //     id: 'seg-' + seg_idx,
    //     classes: ['seg']
    // });

    const seg_w = t2x(seg.end - seg.start);

    let svg = root.svg({
	id: 'svg-' + seg_idx,
	attrs: {
	    width: seg_w,
	    height: 500
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
	T.cur_pitch.slice(Math.round(seg.start*100),
			  Math.round(seg.end*100)), seg);

    render_whiskers(svg, 'segwhisk-' + seg_idx,
		    seq_stats, T.LPAD, seg_w);


    render_pitch(
	svg, 'spath-' + seg_idx,
	T.cur_pitch.slice(Math.round(seg.start*100),
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
    seq_stats.acceleration
	.forEach((a, a_idx) => {
	    if(Math.abs(a) > 0.05) {

		let h = (a/T.MAX_A) * T.PITCH_H;
		let cy = pitch2y(seq_stats.smoothed[a_idx]);
		
		svg.line({id: 'a-' + a_idx,
			  attrs: {
			      x1: fr2x(a_idx),
			      y1: cy - h/2,
			      x2: fr2x(a_idx),
			      y2: cy + h/2,
			      stroke: '#FFBA08'
			  }});
			 
	    }
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

	let wd_stats = pitch_stats(T.cur_pitch.slice(Math.round(wd.start*100),
						     Math.round(wd.end*100)), seg);

	if(wd_stats) {
	    render_whiskers(svg, 'wdwhisk-' + seg_idx + '-' + wd_idx,
			    wd_stats,
			    t2x(wd.start - seg.start),
			    t2x(wd.end - seg.start))
	}
	
	svg.text({id: 'txt-' + seg_idx + '-' + wd_idx,
		  text: wd.word,
		  class: wd.type=='unaligned' ? 'unaligned' : 'word',
		  attrs: {
		      x: t2x(wd.start - seg.start),
		      y: pitch2y((wd_stats&&wd_stats.mean) || seq_stats.mean) - 2,
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

    var meta = T.docs[T.cur_doc];
    
    if(!T.doc_ready) {
        var txt = "Running computations...";
        
        if(!meta.align) {
            txt = "Alignment in progress..."    
        }
        
        new PAL.Element("div", {
            id: "not-ready",
            parent: root,
            text: txt
        });

        return;
    }

    if(!(T.cur_pitch && T.cur_align)) {
        new PAL.Element("div", {
            id: "doc-loading",
            parent: root,
            text: 'Loading...'
        });

        return;
    }

    return true;
}

function render_doc(root, head) {
    if(!render_is_ready(root)) {
	return
    }

    var meta = T.docs[T.cur_doc];
    new PAL.Element("div", {
        id: "h3",
        parent: head,
        text: meta.title
    });

    T.audio_el = new PAL.Element("audio", {
        id: "audio",
        parent: head,
        attrs: {
            controls: true,
            src: "/media/" + meta.path
        }
    });
    
    if(T.docs[T.cur_doc].csv) {
	new PAL.Element("a", {
            id: "csv-dl",
            parent: head,
            text: "Download csv",
            attrs: {
		href: '/media/' + T.docs[T.cur_doc].csv,
		target: "_blank",
		download: meta.title + "-drift.csv"
            }
	});
    }
    

    render_doc_graph(root);    

    var para_el = new PAL.Element("div", {
        id: "payload-para",
        parent: root,
        classes: ['paragraph']
    });

    render_doc_paragraph(para_el);

    // Render zoom slider
    var zoom_box = new PAL.Element("div", {
        id: "zoom",
        parent: root,
        events: {
            onmousedown: function(ev) {
                ev.preventDefault();
                
                var px = (ev.clientX - this.offsetLeft) / this.clientWidth;
                T.cur_zoom = (1-px);
                blit_graph_can();

                (function($el) {
                    window.onmousemove = (ev) => {
                        ev.preventDefault();

                        var px = (ev.clientX - $el.offsetLeft) / $el.clientWidth;
                        px = Math.max(0, Math.min(1, px));
                        T.cur_zoom = (1-px);
                        //blit_graph_can();
                        render();

                    };
                })(this);

                window.onmouseup = (ev) => {
                    ev.preventDefault();
                    window.onmousemove = null;
                    render();
                }
            }
        }
    });

    new PAL.Element("div", {
        parent: zoom_box,
        id: "zoom-text",
        text: 'zoom'
    });

    new PAL.Element("div", {
        parent: zoom_box,
        id: "zoom-status",
        styles: {
            width: "" + Math.round(100*((1-T.cur_zoom)||0.5)) + "%"
        }
    });
}

function render_doc_graph(root) {
    T.graph_can = new PAL.Element("canvas", {
        parent: root,
        id: "graph",
        events: {
            onclick: function(ev) {
                // Click to seek
                var px = (ev.clientX - this.offsetLeft) / this.offsetWidth;
                console.log("px", px);

                T.audio_el.$el.currentTime = T.graph_start + px*(T.graph_end - T.graph_start);
            }
        }
    });
}

function render_doc_paragraph(root) {
    T.cur_align.segments.forEach((seg, seg_idx) => {
        
        let segel = root.div({
            id: "p-" + seg_idx
        });

	if(seg.speaker) {
	    segel.div({
		id: 'spekr-' + seg_idx,
		classes: ['spkr'],
		text: seg.speaker + ': '
	    });
	}
	
	seg.wdlist.forEach((wd, wd_idx) => {
            segel.span({
                id: "wd-" + seg_idx + '-' + wd_idx,
                text: wd.word,
                events: {
                    onclick: () => {
                        T.audio_el.$el.currentTime = wd.start;
                    }
                }
            });
	});

    });

    T.wd_can = new PAL.Element("canvas", {
        id: "wdcan",
        parent: root
    });

    // ...and a little underline here
    T.underline_el = new PAL.Element("div", {
        id: "underline",
        parent: root
    });
}

function place_underline() {
    // see if we have a word intersection

    return
    // TODO

    if(!T.cur_align) {
        return;
    }
    T.cur_align.words
        .forEach((wd, wd_idx) => {
            if(wd.start <= T.cur_t && wd.end >= T.cur_t) {

                var pos = T.wd_pos[wd_idx];
                if(pos) {

                    T.underline_el.$el.style.left = pos.left + pos.width/2 - 4;
                    T.underline_el.$el.style.top = pos.top + 15;
                    
                }
                
            }
        })
}

function render() {

    var root = new PAL.Root();

    let head = render_header(root);

    if(T.cur_doc) {
        //render_doc(root, head);
	render_segs(root, head);
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

    T.cur_align.words.forEach(function(w, w_idx) {
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
    if(T.cur_align) {
        T.cur_align.segments.forEach((seg) => {
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
    if(!w.end || !T.cur_pitch) {
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
    while(!T.cur_pitch[st_idx+offset]) {
        offset += 1
        if(offset >= T.cur_pitch.length) {
            break;
        }
    }

    var in_line = false;
    for(var i=st_idx; i<=end_idx; i++) {
        if(T.cur_pitch[i]) {
            if(!in_line) {
                ctx.beginPath();
                ctx.moveTo(x + (i-st_idx)*step, y + y_off + pitch2y(T.cur_pitch[i], p_h));
                //ctx.moveTo(x + offset*step, y + y_off + pitch2y(T.cur_pitch[st_idx+offset], p_h));
                in_line = true;
            }
            else {
                ctx.lineTo(x + (i-st_idx)*step, y + y_off + pitch2y(T.cur_pitch[i], p_h));
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
    return T.PITCH_H - p;
    
    // p_h = p_h || T.PITCH_H;
    
    // if(p == 0) {
    //     return p;
    // }
    // return p_h - (p - T.MIN_PITCH) * T.PITCH_SC * p_h;
}

function tick() {
    if(T.ticking != T.cur_doc) {
        T.ticking = false;
        return;
    }

    if(T.audio_el && T.audio_el.$el) {
        var t = T.audio_el.$el.currentTime;
        //if(!T.cur_t || Math.abs(t-T.cur_t)>1/50) {
        if(!T.cur_t || t != T.cur_t) {
            T.cur_t = t;
            blit_graph_can();

            place_underline();
        }
    }

    window.requestAnimationFrame(tick);
}

window.onhashchange = () => {
    var docid = window.location.hash.slice(1);
    console.log("hash", docid, window);
    
    if(docid in T.docs) {
        T.cur_doc = docid;
        //setup_doc();
	
	T.wd_els = {};              // idx -> Element
	doc_update();		    // XXX: check this flow

        T.ticking = T.cur_doc;
        tick();
    }
    else if(docid) {
        window.location.hash = "";
        return;
    }
    else {
        // if(T.cur_doc) {
        //     teardown_doc();
        // }
        T.cur_doc = undefined;
    }
    render();
}


render();
