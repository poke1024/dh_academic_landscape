const pSBC=(p,c0,c1,l)=>{
    let r,g,b,P,f,t,h,i=parseInt,m=Math.round,a=typeof(c1)=="string";
    if(typeof(p)!="number"||p<-1||p>1||typeof(c0)!="string"||(c0[0]!='r'&&c0[0]!='#')||(c1&&!a))return null;
    if(!this.pSBCr)this.pSBCr=(d)=>{
        let n=d.length,x={};
        if(n>9){
            [r,g,b,a]=d=d.split(","),n=d.length;
            if(n<3||n>4)return null;
            x.r=i(r[3]=="a"?r.slice(5):r.slice(4)),x.g=i(g),x.b=i(b),x.a=a?parseFloat(a):-1
        }else{
            if(n==8||n==6||n<4)return null;
            if(n<6)d="#"+d[1]+d[1]+d[2]+d[2]+d[3]+d[3]+(n>4?d[4]+d[4]:"");
            d=i(d.slice(1),16);
            if(n==9||n==5)x.r=d>>24&255,x.g=d>>16&255,x.b=d>>8&255,x.a=m((d&255)/0.255)/1000;
            else x.r=d>>16,x.g=d>>8&255,x.b=d&255,x.a=-1
        }return x};
    h=c0.length>9,h=a?c1.length>9?true:c1=="c"?!h:false:h,f=this.pSBCr(c0),P=p<0,t=c1&&c1!="c"?this.pSBCr(c1):P?{r:0,g:0,b:0,a:-1}:{r:255,g:255,b:255,a:-1},p=P?p*-1:p,P=1-p;
    if(!f||!t)return null;
    if(l)r=m(P*f.r+p*t.r),g=m(P*f.g+p*t.g),b=m(P*f.b+p*t.b);
    else r=m((P*f.r**2+p*t.r**2)**0.5),g=m((P*f.g**2+p*t.g**2)**0.5),b=m((P*f.b**2+p*t.b**2)**0.5);
    a=f.a,t=t.a,f=a>=0||t>=0,a=f?a<0?t:t<0?a:a*P+t*p:0;
    if(h)return"rgb"+(f?"a(":"(")+r+","+g+","+b+(f?","+m(a*1000)/1000:"")+")";
    else return"#"+(4294967296+r*16777216+g*65536+b*256+(f?m(a*255):0)).toString(16).slice(1,f?undefined:-2)
}

async function fetchGzippedJson(url) {
    const response = await fetch(url);
    data = await (await response.blob()).arrayBuffer();
    let result = pako.ungzip(new Uint8Array(data), {"to": "string"});
    let obj = JSON.parse(result);
    return obj
}

var doc_data;
var topic_data;
var term_data;

var x_positions = [];
var y_positions = [];
var z_positions = [];
var colors_r = [];
var colors_g = [];
var colors_b = [];
var doi = [];
var disciplines = [];

var currentlySelectedTopic = null;

Promise.allSettled([fetchGzippedJson('data/doc_details_map.json.gz'), 
fetchGzippedJson('data/topic_details_map.json.gz'),
fetchGzippedJson('data/term_details_map.json.gz')])
    .then(function(result) {
        doc_data = result[0]["value"];
        topic_data = result[1]["value"];
        term_data = result[2]["value"];
        draw();
        initTopicList();
    });

function initTopicList() {
    let topicList = document.getElementById('topicList');
    for (let topic in topic_data) {
        let terms = topic_data[topic]["terms"];
        let termsSorted = Object.keys(terms).sort(function(a,b){return terms[b]-terms[a]});
        var li = document.createElement("option");
        li.appendChild(document.createTextNode("[" + topic + "]\t" + termsSorted.join(", ")));
        li.value = topic;
        topicList.appendChild(li);
    }
    $(".chosen-select").chosen();
}

function processTopicSelect() {
    currentlySelectedTopic = parseInt(document.getElementById("topicList").value);
    filterByTopic();
    document.getElementById('articleInfo').style.display = "none";
}

var discipline_colors = {'digital_humanities': '#5267a1',
'information_science': '#d4dc9c',
'computational_linguistics': '#853e39',
'linguistics': '#74bbcd',
'applied_cs': '#c6aa52',
'theoretical_cs': '#604c81',
'mathematics': '#c8e1b6',
'statistics': '#a66d2d',
'sociology': '#addcc8',
'political_science': '#4f84b7',
'history': '#98572c',
'literary_theory': '#b9913d',
'art_history': '#713a5c',
'philosophy': '#92cfce',
'musicology': '#d5ce81',
'classical_studies': '#5aa0c5'};

var discipline_colors_unselected = {};

for (let key of Object.keys(discipline_colors)) {
    discipline_colors_unselected[key] = Lore.Core.Color.hexToRgb(pSBC ( 0.75, discipline_colors[key] ));
    discipline_colors[key] = Lore.Core.Color.hexToRgb(discipline_colors[key]);
}

let lore = Lore.init('lore', {
    clearColor: '#ffffff',
    antialiasing: true
});

let pointHelper = new Lore.Helpers.PointHelper(lore, 'FlyBaby', 'circle');
let octreeHelper = null;
let coordinateHelper = null;

let selected_article = 0;
let nearest_neighbors = null;
var nearest_neighbors_cache = {};

var filtered_articles = [];
var adjacencyMatrixFiltered = {};

var positions = [];

function filterByTopic() {
    filtered_articles = [];
    console.log(currentlySelectedTopic);
    console.log(currentlySelectedTopic === -1);
    if (currentlySelectedTopic === -1) {
        updateColors();
        return;
    }
    relevant_docs = topic_data[currentlySelectedTopic]["docs"];
    for (var i = 0; i <= doi.length; i += 1) {
        if (doi[i] in relevant_docs) {
            filtered_articles.push(i);
        }
    }
    updateColors();
}

function updateColors() {
    colors_r = [];
    colors_g = [];
    colors_b = [];
    var sizes = [];
    z_positions = [];
    for (var i = 0; i < doi.length; i += 1) {
        if (filtered_articles.length === 0) {
            var color = discipline_colors[disciplines[i]];
            colors_r.push(color[0]);
            colors_g.push(color[1]);
            colors_b.push(color[2]);
            sizes.push(1);
            z_positions.push(0);
        } else if (!filtered_articles.includes(i)) {
            var color = discipline_colors_unselected[disciplines[i]];
            colors_r.push(color[0]);
            colors_g.push(color[1]);
            colors_b.push(color[2]);
            sizes.push(1);
            z_positions.push(0);
        } else {
            var color = discipline_colors[disciplines[i]];
            colors_r.push(color[0]);
            colors_g.push(color[1]);
            colors_b.push(color[2]);
            sizes.push(3);
            z_positions.push(10);
        }
    }
    pointHelper.setPositionsXYZ(x_positions, y_positions, z_positions);
    pointHelper.setRGBFromArrays(colors_r, colors_g, colors_b);
    pointHelper.setSize(sizes);
}

function draw() {
    x_positions = [];
    y_positions = [];
    z_positions = [];
    colors_r = [];
    colors_g = [];
    colors_b = [];
    doi = [];
    disciplines = [];
    
    for (let article of Object.values(doc_data)) {
        doi.push(article["doi"]);
        disciplines.push(article["discipline"]);
        x_positions.push(article["x_pos"]);
        y_positions.push(article["y_pos"]);
        z_positions.push(0);
        color = discipline_colors[article["discipline"]];
        colors_r.push(color[0]);
        colors_g.push(color[1]);
        colors_b.push(color[2]);
    }

    x_positions = Lore.Math.Statistics.normalize(x_positions);
    y_positions = Lore.Math.Statistics.normalize(y_positions);
    for (var i = 0; i < x_positions.length; i += 1) {
        x_positions[i] = 1000 * x_positions[i];
        y_positions[i] = 1000 * y_positions[i];
        positions.push(x_positions[i]);
        positions.push(y_positions[i]);
        positions.push(0);
    }

    pointHelper.setXYZRGBS(x_positions, y_positions, z_positions, colors_r, colors_g, colors_b, 1);
    pointHelper.setPointScale(4.0);
    pointHelper.setFog([1.0, 1.0, 1.0, 1.0], 1.0);

    lore.controls.setLookAt(pointHelper.getCenter());
    lore.controls.setRadius(pointHelper.getMaxRadius());
    lore.controls.setFrontView();

    // coordinateHelper = Lore.Helpers.CoordinatesHelper.fromPointHelper(pointHelper, { box: { enabled: false } })

    octreeHelper = new Lore.Helpers.OctreeHelper(lore, 'OctreeGeometry', 'tree', pointHelper);

    var distanceAndDirection = function(pointA, pointB){
        var dx = pointB[0] - pointA[0];
        var dy = pointB[1] - pointA[1];
        // var dz = pointB[2] - pointA[2];
        
        var dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));// + Math.pow(dz, 2));
       
        var theta = Math.atan2(dy, dx); // range (-PI, PI]
        theta *= 180 / Math.PI; // rads to degs, range (-180, 180]
        var directions = [];
        if (theta > 120 || theta < -120) {
            directions.push("right");
        } 
        if (theta <= 150 && theta > 30) {
            directions.push("down");
        } 
        if (theta <= 60 && theta > -60) {
            directions.push("left");
        }  
        if (theta <= -30 && theta >= -150) {
            directions.push("up");
        }
        
        return [dist, directions];
    }


    function getAdjacencyMatrixFiltered() {
        adjacencyMatrixFiltered = {};

        for (let idxA in filtered_articles) {
            idxA = filtered_articles[idxA];
            let minDist = { "down" : 100000,
                            "up" : 100000,
                            "left" : 100000,
                            "right" : 100000 };

            adjacencyMatrixFiltered[idxA] = {
                "down" : idxA,
                "up" : idxA,
                "left" : idxA,
                "right" : idxA
            };
            for (let idxB in filtered_articles) {
                idxB = filtered_articles[idxB];
                if (idxB === idxA) continue;
                distDir = distanceAndDirection([x_positions[idxB], y_positions[idxB]],
                    [x_positions[idxA], y_positions[idxA]],
                    );
                for (let dir of distDir[1]) {
                    if (distDir[0] < minDist[dir]) {
                        minDist[dir] = distDir[0];
                        adjacencyMatrixFiltered[idxA][dir] = idxB;
                    }
                }
            }
        }
    }

    function getNearestFiltered(pointIdx, dir) {
        let minDist = 100000;
        let minIdx = null;

        for (let idx in filtered_articles) {
            idx = filtered_articles[idx];
            distDir = distanceAndDirection([x_positions[pointIdx], y_positions[pointIdx]],
                [x_positions[idx], y_positions[idx]]);
            if (!distDir[1].includes(dir)) {
                continue;
            }
            if (distDir[0] < minDist) {
                    minDist = distDir[0];
                    minIdx = idx;
                }
        }
        return minIdx;
    }


    function getNearestNeighbors(pointIndex, filter = true) {
        if (pointIndex in nearest_neighbors_cache) {
            console.log("in cache");
            return nearest_neighbors_cache[pointIndex];
        }
        var nn_indices = octreeHelper.octree.kNearestNeighbours(500, pointIndex, null, positions);
        var pointPosition = [positions[pointIndex * 3], positions[pointIndex * 3 + 1], positions[pointIndex * 3 + 2]];
        var nn_distances = { };
        var nn_directions = {
            "left" : null,
            "right" : null,
            "up" : null,
            "down" : null
        };
        for (let idx in nn_indices) {
            idx = nn_indices[idx];
            if (filter && filtered_articles.length !== 0 && !filtered_articles.includes(idx)) {
                continue;
            }
            if (idx != pointIndex) {
                position = [positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]];
                let distanceDirection = distanceAndDirection(position, pointPosition);
                nn_distances[idx] = distanceDirection[0];
                for (let direction of distanceDirection[1]) {
                    if (!nn_directions[direction]) {
                        nn_directions[direction] = idx;
                    } else if (distanceDirection[0] < nn_distances[nn_directions[direction]]) {
                        nn_directions[direction] = idx;
                    }
                }
                //if (nn_directions["left"] && nn_directions["right"] && nn_directions["up"] && nn_directions["down"]) {
                //    break;
                //}
            } 
        }

        for (let direction of ["up", "down"]) {
            if (!nn_directions[direction]) {
                if (nn_directions["left"] && nn_directions["right"]) {
                    const random = Math.floor(Math.random() * 2);
                    nn_directions[direction] = [nn_directions["left"], nn_directions["right"]][random];
                } else if (nn_directions["left"]) {
                    nn_directions[direction] = nn_directions["left"];
                } else if (nn_directions["right"]) {
                    nn_directions[direction] = nn_directions["right"];
                } else {
                    nn_directions[direction] = pointIndex;
                }
            }
        }

        for (let direction of ["left", "right"]) {
            if (!nn_directions[direction]) {
                if (nn_directions["up"]) {
                    nn_directions[direction] = nn_directions["up"];
                } else if (nn_directions["down"]) {
                    nn_directions[direction] = nn_directions["down"];
                } else {
                    nn_directions[direction] = pointIndex;
                }
            }
        }

        nearest_neighbors_cache[pointIndex] = nn_directions;

        return nn_directions;
    };

    function displayArticleInfo() {
        var screenPosition = octreeHelper.getScreenPosition(selected_article);
        let articleInfo = document.getElementById('articleInfo');
        articleInfo.style.left = screenPosition[0] + "px";
        articleInfo.style.top = screenPosition[1] + "px";
        let bgColor = discipline_colors_unselected[doc_data[doi[selected_article]]["discipline"]];
        articleInfo.style.backgroundColor = "rgba(" + bgColor[0] + ", " + bgColor[1] + ", " + bgColor[2] + ", 0.8)";
        articleInfo.innerHTML = selected_article + " " + doc_data[doi[selected_article]]["title"] + "";
        articleInfo.style.display = "block";
        getAdjacencyMatrixFiltered();
    }

    octreeHelper.addEventListener('hoveredchanged', function(e) {
        if (e.e) {
            if (filtered_articles.length === 0 || filtered_articles.includes(e.e.index))  {
                nearest_neighbors = getNearestNeighbors(e.e.index);
                selected_article = e.e.index;
                displayArticleInfo();
            } else {
                let minDist = 100000;
                let minDistIdx = null;
                for (let idx in filtered_articles) {
                    idx = filtered_articles[idx];
                    console.log(idx);
                    distDir = distanceAndDirection([x_positions[idx], y_positions[idx]], 
                        [x_positions[e.e.index], y_positions[e.e.index]]);
                    console.log(distDir[0]);
                    if (distDir[0] < minDist) {
                        minDist = distDir[0];
                        minDistIdx = idx;
                    }
                }
                if (minDistIdx && minDist < 50) {
                    nearest_neighbors = getNearestNeighbors(minDistIdx);
                    selected_article = minDistIdx;
                    displayArticleInfo();
                } else {
                    document.getElementById("articleInfo").style.display = "none";
                }
            }
        } else {
            document.getElementById("articleInfo").style.display = "none";
        }
    });

    document.addEventListener('keydown', function(e) {
        if (document.activeElement.tagName === "INPUT"){
            return;
        }
        let nnDir = null;
        if (e.key === "ArrowLeft") {
            nnDir = "left";
        } else if (e.key === "ArrowRight") {
            nnDir = "right";
        } else if (e.key === "ArrowUp") {
            nnDir = "up";
        } else if (e.key === "ArrowDown") {
            nnDir = "down";
        }
        if (filtered_articles.length === 0) {
            selected_article = nearest_neighbors[nnDir];
            nearest_neighbors = getNearestNeighbors(selected_article);
        } else {
            if (filtered_articles.includes(selected_article)) {
                console.log(adjacencyMatrixFiltered);
                selected_article = adjacencyMatrixFiltered[selected_article][nnDir];
            } else {
                selected_article = getNearestFiltered(selected_article);
            }
        }

        console.log("selected:", selected_article);

        lore.controls.setLookAt(pointHelper.getPosition(selected_article));

        displayArticleInfo();
    });
    };


    document.addEventListener('mousewheel', function(e) {
        pointHelper.setPointScale(4.0 * (1 / lore.controls.camera.zoom**0.66));
    });