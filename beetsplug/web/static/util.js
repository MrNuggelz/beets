class TaskChange {
    constructor() {
        this.div = $("<div>").addClass("taskDiv");
        this.actionsDiv = $("<div>").addClass("actions");
        $('div[id=tasks]').append(this.div);
    }

    addButtons(index) {
        this.createButton(this.actionsDiv, function () { applyTask(index) }, "Apply");
        this.createButton(this.actionsDiv, function () { skip(index) }, "Skip");
        this.createButton(this.actionsDiv, function () { asIs(index) }, "As Is");
        this.createButton(this.actionsDiv, function () { asTracks(index) }, "As Tracks");
        this.createButton(this.actionsDiv, function () { searchName(taskDiv, index) }, "enter Search");
        this.createButton(this.actionsDiv, function () { searchId(taskDiv, index) }, "enter Id");
    }

    createButton(el, fn, t) {
        const button = $('<button>').text(t).click(fn);
        el.append(button);
    }

    line(node) {
        this.div.append(node);
        this.div.append($('<br>'));
    }

    table(rows) {
        const table = $('<table>');
        for (let i = 0; i < rows.length; i++) {
            table.append(rows[i]);
        }
        this.div.append(table);
    }

    row(elems) {
        const tr = $('<tr>');
        for (let i = 0; i < elems.length; i++) {
            tr.append($('<td>').text(elems[i]));
        }
        return tr;
    }

    spanLine(t, indend = false) {
        const node = $("<span>").text(t);
        if (indend) {
            node.attr("class", "indend");
        }
        this.line(node);
    }

    penaltyString(distance) {
        const penalties = [];
        const keys = distance.penalties;
        for (let j = 0; j < keys.length; j++) {
            keys[j] = keys[j].replace("album_", "");
            keys[j] = keys[j].replace("track_", "");
            keys[j] = keys[j].replace("_", " ");
            penalties.push(keys[j]);
        }
        if (penalties.length > 0) {
            return `(${penalties.join(", ")})`;
        }
        return '';
    }

    disambigString(info) {
        const disambig = [];
        if (info.data_source && info.data_source !== "MusicBrainz") {
            disambig.push(info.data_source);
        }
        if (info.media) {
            if (info.mediums && info.mediums > 1) {
                disambig.push(`${info.mediums}x${info.media}`);
            } else {
                disambig.push(info.media);
            }
        }
        if (info.year) {
            disambig.push(info.year);
        }
        if (info.country) {
            disambig.push(info.country);
        }
        if (info.label) {
            disambig.push(info.label);
        }
        if (info.catalognum) {
            disambig.push(info.catalognum);
        }
        if (info.albumdisambig) {
            disambig.push(info.albumdisambig);
        }
        return disambig.join(", ");
    }

    showAlbum(artist, album) {
        if (artist) {
            this.spanLine(`${artist} - ${album}`, true);
        } else if (album) {
            this.spanLine(`${album}`, true);
        } else {
            this.spanLine("(unknown album)", true);
        }
    }

    showChange(task, index) {
        this.spanLine(`${task.paths[0]} (${task.items.length} items)`);
        if (task.candidates.length <= 0) {
            let e1 = $("<span>").attr("text", "no candidates found");
            $("div[id='tasks']").append(e1);
            return;
        }
        const match = task.candidates[0];
        if (task.cur_artist !== match.info.artist || (task.cur_album !== match.info.album && match.info.album !== "letious Artists")) {
            let artist_l = null;
            let album_l = null;
            if (typeof task.cur_artist !== 'undefined') {
                artist_l = task.cur_artist;
            }
            if (typeof task.cur_album !== 'undefined') {
                album_l = task.cur_album;
            }
            let artist_r = match.info.artist;
            const album_r = match.info.album;
            if (match.info.artist === 'letious Artists') {
                artist_l = '';
                artist_r = '';
            }
            this.spanLine("Correcting tags from:");
            this.showAlbum(artist_l, album_l);
            this.spanLine("To:");
            this.showAlbum(artist_r, album_r)
        } else {
            this.spanLine("Tagging:");
            this.spanLine(`${match.info.artist} - ${match.info.album}`, true);
        }

        if (match.info.data_url) {
            this.spanLine("URL:");
            this.spanLine(`${match.info.data_url}`, true)
        }
        const info = [];
        // distance
        info.push(`(Similarity: ${((1 - match.distance.distance) * 100).toFixed(2)}%)`);

        let penalties = this.penaltyString(match.distance);
        if (penalties !== '') {
            info.push(penalties);
        }

        const disambig = this.disambigString(match.info);
        if (disambig !== '') {
            info.push(`(${disambig})`);
        }
        this.spanLine(info.join(" "));

        // tracks
        const pairs = match.mapping;
        pairs.sort();

        const lines = [];
        let medium = null;
        let disctitle = null;
        for (let i = 0; i < pairs.length; i++) {

            // Medium number and title.
            const item = pairs[i][0];
            const track_info = pairs[i][1];
            if (medium !== track_info || disctitle !== track_info.disctitle) {
                let media = match.info.media;
                if (!media) {
                    media = "Media";
                }
                let lhs = false;
                if (match.info.mediums > 1 && track_info.disctitle) {
                    lhs = `${media} ${track_info.medium}: ${track_info.dicstitle}`;
                } else if (match.info.mediums > 1) {
                    lhs = `${media} ${track_info.medium}`;
                } else if (track_info.dicstitle) {
                    lhs = `${media}: ${track_info.discttile}`
                }
                if (lhs) {
                    lines.push([lhs, "", 0])
                }
                medium = track_info.medium;
                disctitle = track_info.disctitle;
            }

            // Titles
            const new_title = track_info.title;
            let cur_title = item.path;
            if (item.title) {
                cur_title = item.title;
            }
            let lhs = cur_title;
            let rhs = new_title;
            let lhs_width = cur_title.length;

            // Track number change.
            const cur_track = item.track;
            const new_track = track_info.index;
            if (cur_track !== new_track) {
                lhs = `(#${cur_track}) ${lhs}`;
                rhs = `(#${new_track}) ${rhs}`;
                lhs_width += cur_track.length + 4;
            }

            // Length change.
            // TODO

            // Penalties
            penalties = this.penaltyString(match.distance.tracks[track_info.track_id]);
            if (lhs !== rhs || penalties) {
                lines.push([` * ${lhs}`, `-> ${rhs}`, penalties])
            }
        }

        let rows = [];
        for (let i = 0; i < lines.length; i++) {
            rows.push(this.row(lines[i]));
        }
        this.table(rows);

        // Missing and unmatched tracks.
        if (typeof match.extra_tracks !== 'undefined' && match.extra_tracks.length > 0) {
            this.spanLine(`Missing tracks (${match.extra_tracks.length}/${match.info.tracks.length})`);
            for (let i = 0; i < match.extra_tracks.length; i++) {
                const track_info = match.extra_tracks[i];
                const interval = Math.floor(track_info.length);
                this.spanLine(`! (${track_info.title} (#${track_info.index}) (${Math.floor(interval / 60)}:${interval % 60})`, true);
            }
        }


        if (typeof match.extra_items !== 'undefined') {
            this.spanLine(`Unmatched tracks (${match.extra_items.length})`);
            for (let i = 0; i < match.extra_items.length; i++) {
                const item = match.extra_items[i];
                let length = '';
                if (item.length) {
                    const interval = Math.floor(track_info.length);
                    length = ` (${Math.floor(interval / 60)}:${interval % 60})`
                }
                this.spanLine(`! (${item.title} (#${item.index})${length}`, true);
            }
        }

        this.addButtons(index);
        this.div.append(this.actionsDiv);
    }

    enterSearch(task_index) {
        $("button[name='searchNameButton']").remove();
        $("input[name='artist']").remove();
        $("input[name='album']").remove();
        $("button[name='searchIdButton']").remove();
        $("input[name='searchId']").remove();
        var artist = $("<input>").attr("name", "artist").val("artist");
        var album = $("<input>").attr("name", "album").val("album");
        this.actionsDiv.append(artist, album);
        var button = $("<button>",
                {
                    text: 'search',
                    click: function () {
                        $.ajax({
                            url: '/api/import/searchName',
                            type: 'PUT',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                "task_index": task_index,
                                'artist': artist.val(),
                                'name': album.val()
                            }),
                            success: function (data) {
                                window.location.replace("/import")
                            }
                        });
                    }
                }).attr("name", "searchNameButton");
        this.actionsDiv.parent().append(button);
    }

    enterSearchId(task_index) {
        $("button[name='searchIdButton']").remove();
        $("input[name='searchId']").remove();
        $("button[name='searchNameButton']").remove();
        $("input[name='artist']").remove();
        $("input[name='album']").remove();
        var searchId = $("<input>").attr("name", "searchId").val("searchId");
        this.actionsDiv.parent().append(searchId);
        var button = $("<button>",
                {
                    text: 'search',
                    click: function () {
                        $.ajax({
                            url: '/api/import/searchId',
                            type: 'PUT',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                "task_index": task_index,
                                'id': searchId.val()
                            }),
                            success: function (data) {
                                window.location.replace("/import")
                            }
                        });
                    }
                }).attr("name", "searchIdButton");
        this.actionsDiv.append(button);
    }
}

window.onload = function () {
    $.ajax({
        url: '/api/tasks',
        type: 'GET',
        success: function (json) {
            const tasks = JSON.parse(json);
            for (let task_index = 0; task_index < tasks.length; task_index++) {
                const task = tasks[task_index];
                new TaskChange().showChange(task, task_index);
            }
        },
        error: function (xhr, ajaxOptions, thrownError) {
            const errorMsg = 'Ajax request failed: ' + xhr.responseText;
            $('#content').html(errorMsg);
        }
    });
};