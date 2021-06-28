async function fetchGzippedJson(url) {
    const response = await fetch(url);
    data = await (await response.blob()).arrayBuffer();
    let result = pako.ungzip(new Uint8Array(data), {"to": "string"});
    let obj = JSON.parse(result);
    return obj
}

var docData;
var topicData;
var termData;

var xPositions = [];
var yPositions = [];
var zPositions = [];
var colorsR = [];
var colorsG = [];
var colorsB = [];
var doiValues = [];
var disciplines = [];

var currentlySelectedTopic = null;

Promise.allSettled([fetchGzippedJson('data/doc_details_map.json.gz'), 
fetchGzippedJson('data/topic_details_map.json.gz'),
fetchGzippedJson('data/term_details_map.json.gz')])
    .then(function(result) {
        docData = result[0]["value"];
        topicData = result[1]["value"];
        termData = result[2]["value"];
        draw();
        initTopicList();
        initArticleList();
    });

function getTopicTerms(topicIdx) {
    let terms = topicData[topicIdx]["terms"];
    let termsSorted = Object.keys(terms).sort(function(a,b){return terms[b]-terms[a]});
    return termsSorted;
}

function initTopicList() {
    let topicList = document.getElementById('topicList');
    for (let topic in topicData) {
        let termsSorted = getTopicTerms(topic);
        var li = document.createElement("option");
        li.appendChild(document.createTextNode("[" + topic + "]\t" + termsSorted.join(", ")));
        li.value = topic;
        topicList.appendChild(li);
    }
    $("#topicList").chosen();
}

function processTopicSelect() {
    currentlySelectedTopic = parseInt(document.getElementById("topicList").value);
    filterByTopic();
    document.getElementById('articleInfo').style.display = "none";
}



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

var disciplineColors = {'digital_humanities': '#5267a1',
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

var disciplineColorsUnselected = {};

for (let key of Object.keys(disciplineColors)) {
    disciplineColorsUnselected[key] = Lore.Core.Color.hexToRgb(pSBC ( 0.75, disciplineColors[key] ));
    disciplineColors[key] = Lore.Core.Color.hexToRgb(disciplineColors[key]);
}

let lore = Lore.init('lore', {
    clearColor: '#ffffff',
    antialiasing: true
});

let pointHelper = new Lore.Helpers.PointHelper(lore, 'FlyBaby', 'circle');
let octreeHelper = null;
let coordinateHelper = null;

let selectedArticle = 9907;
let mouseOverArticle = false;
let hoverTime = Date.now();
var initMode = true;
var selectedBySearch = false;
var hardSelect = false;
let nearestNeighbors = null;
var nearestNeighborsCache = {};

var filteredArticles = [];
var adjacencyMatrixFiltered = {};

var positions = [];
function filterByTopic() {
    filteredArticles = [];
    if (currentlySelectedTopic === -1) {
        updateColors();
        return;
    }
    let relevantDocs = topicData[currentlySelectedTopic]["docs"];
    for (var i = 0; i <= doiValues.length; i += 1) {
        if (doiValues[i] in relevantDocs) {
            filteredArticles.push(i);
        }
    }
    updateColors();
}

function updateColors() {
    colorsR = [];
    colorsG = [];
    colorsB = [];
    var sizes = [];
    zPositions = [];
    for (var i = 0; i < doiValues.length; i += 1) {
        if (filteredArticles.length === 0) {
            var color = disciplineColors[disciplines[i]];
            colorsR.push(color[0]);
            colorsG.push(color[1]);
            colorsB.push(color[2]);
            sizes.push(1);
            zPositions.push(0);
        } else if (!filteredArticles.includes(i)) {
            var color = disciplineColorsUnselected[disciplines[i]];
            colorsR.push(color[0]);
            colorsG.push(color[1]);
            colorsB.push(color[2]);
            sizes.push(1);
            zPositions.push(0);
        } else {
            var color = disciplineColors[disciplines[i]];
            colorsR.push(color[0]);
            colorsG.push(color[1]);
            colorsB.push(color[2]);
            sizes.push(3);
            zPositions.push(10);
        }
    }
    pointHelper.setPositionsXYZ(xPositions, yPositions, zPositions);
    pointHelper.setRGBFromArrays(colorsR, colorsG, colorsB);
    pointHelper.setSize(sizes);
}

function draw() {
    xPositions = [];
    yPositions = [];
    zPositions = [];
    colorsR = [];
    colorsG = [];
    colorsB = [];
    doiValues = [];
    disciplines = [];
    
    for (let article of Object.values(docData)) {
        doiValues.push(article["doi"]);
        disciplines.push(article["discipline"]);
        xPositions.push(article["x_pos"]);
        yPositions.push(article["y_pos"]);
        zPositions.push(0);
        color = disciplineColors[article["discipline"]];
        colorsR.push(color[0]);
        colorsG.push(color[1]);
        colorsB.push(color[2]);
    }

    xPositions = Lore.Math.Statistics.normalize(xPositions);
    yPositions = Lore.Math.Statistics.normalize(yPositions);
    for (var i = 0; i < xPositions.length; i += 1) {
        xPositions[i] = 1000 * xPositions[i];
        yPositions[i] = 1000 * yPositions[i];
        positions.push(xPositions[i]);
        positions.push(yPositions[i]);
        positions.push(0);
    }

    pointHelper.setXYZRGBS(xPositions, yPositions, zPositions, colorsR, colorsG, colorsB, 1);
    pointHelper.setPointScale(4.0);
    pointHelper.setFog([1.0, 1.0, 1.0, 1.0], 1.0);

    lore.controls.setLookAt(pointHelper.getCenter());
    lore.controls.setRadius(pointHelper.getMaxRadius());
    lore.controls.setFrontView();

    // coordinateHelper = Lore.Helpers.CoordinatesHelper.fromPointHelper(pointHelper, { box: { enabled: false } })

    octreeHelper = new Lore.Helpers.OctreeHelper(lore, 'OctreeGeometry', 'tree', pointHelper);

    octreeHelper.addEventListener('hoveredchanged', function(e) {
        if ((Date.now() - hoverTime) < 20) {
            hoverTime = Date.now();
            return;
        } else {
            hoverTime = Date.now();
        }
        if (e.e) {
            mouseOverArticle = true;
        } else {
            mouseOverArticle = false;
        }
        if (e.e && !hardSelect) {
            initMode = false;
            selectedBySearch = false;
            if (filteredArticles.length === 0 || filteredArticles.includes(e.e.index))  {
                nearestNeighbors = getNearestNeighbors(e.e.index);
                selectedArticle = e.e.index;
                displayArticleInfo();
            } else {
                let minDist = 100000;
                let minDistIdx = null;
                for (let idx in filteredArticles) {
                    idx = filteredArticles[idx];
                    console.log(idx);
                    distDir = distanceAndDirection([xPositions[idx], yPositions[idx]], 
                        [xPositions[e.e.index], yPositions[e.e.index]]);
                    console.log(distDir[0]);
                    if (distDir[0] < minDist) {
                        minDist = distDir[0];
                        minDistIdx = idx;
                    }
                }
                if (minDistIdx && minDist < 100) {
                    nearestNeighbors = getNearestNeighbors(minDistIdx);
                    selectedArticle = minDistIdx;
                    displayArticleInfo();
                } else {
                    document.getElementById("articleInfo").style.display = "none";
                }
            }
        } else {
            if (initMode || selectedBySearch || hardSelect)  { 
                return;
            }
            let articleInfoBox = document.getElementById("articleInfo");
            articleInfoBox.style.display = "none";
        }
    });
    

    document.addEventListener('click', function(e) {
        let articleInfoBox = document.getElementById("articleInfo");
        if (document.getElementById("articleInfo").style.display != "none") {
            hardSelect = true;
            articleInfoBox.style.pointerEvents = 'auto';
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
        if (filteredArticles.length === 0) {
            selectedArticle = nearestNeighbors[nnDir];
            nearestNeighbors = getNearestNeighbors(selectedArticle);
        } else {
            if (filteredArticles.includes(selectedArticle)) {
                console.log(adjacencyMatrixFiltered);
                selectedArticle = adjacencyMatrixFiltered[selectedArticle][nnDir];
            } else {
                selectedArticle = getNearestFiltered(selectedArticle);
            }
        }

        console.log("selected:", selectedArticle);

        lore.controls.setLookAt(pointHelper.getPosition(selectedArticle));

        displayArticleInfo();
    });

        displayArticleInfo();
    };

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

        for (let idxA in filteredArticles) {
            idxA = filteredArticles[idxA];
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
            for (let idxB in filteredArticles) {
                idxB = filteredArticles[idxB];
                if (idxB === idxA) continue;
                distDir = distanceAndDirection([xPositions[idxB], yPositions[idxB]],
                    [xPositions[idxA], yPositions[idxA]],
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

        for (let idx in filteredArticles) {
            idx = filteredArticles[idx];
            distDir = distanceAndDirection([xPositions[pointIdx], yPositions[pointIdx]],
                [xPositions[idx], yPositions[idx]]);
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
        if (pointIndex in nearestNeighborsCache) {
            console.log("in cache");
            return nearestNeighborsCache[pointIndex];
        }
        var nnIndices = octreeHelper.octree.kNearestNeighbours(500, pointIndex, null, positions);
        var pointPosition = [positions[pointIndex * 3], positions[pointIndex * 3 + 1], positions[pointIndex * 3 + 2]];
        var nnDistances = { };
        var nnDirections = {
            "left" : null,
            "right" : null,
            "up" : null,
            "down" : null
        };
        for (let idx in nnIndices) {
            idx = nnIndices[idx];
            if (filter && filteredArticles.length !== 0 && !filteredArticles.includes(idx)) {
                continue;
            }
            if (idx != pointIndex) {
                position = [positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]];
                let distanceDirection = distanceAndDirection(position, pointPosition);
                nnDistances[idx] = distanceDirection[0];
                for (let direction of distanceDirection[1]) {
                    if (!nnDirections[direction]) {
                        nnDirections[direction] = idx;
                    } else if (distanceDirection[0] < nnDistances[nnDirections[direction]]) {
                        nnDirections[direction] = idx;
                    }
                }
                //if (nn_directions["left"] && nn_directions["right"] && nn_directions["up"] && nn_directions["down"]) {
                //    break;
                //}
            } 
        }

        for (let direction of ["up", "down"]) {
            if (!nnDirections[direction]) {
                if (nnDirections["left"] && nnDirections["right"]) {
                    const random = Math.floor(Math.random() * 2);
                    nnDirections[direction] = [nnDirections["left"], nnDirections["right"]][random];
                } else if (nnDirections["left"]) {
                    nnDirections[direction] = nnDirections["left"];
                } else if (nnDirections["right"]) {
                    nnDirections[direction] = nnDirections["right"];
                } else {
                    nnDirections[direction] = pointIndex;
                }
            }
        }

        for (let direction of ["left", "right"]) {
            if (!nnDirections[direction]) {
                if (nnDirections["up"]) {
                    nnDirections[direction] = nnDirections["up"];
                } else if (nnDirections["down"]) {
                    nnDirections[direction] = nnDirections["down"];
                } else {
                    nnDirections[direction] = pointIndex;
                }
            }
        }

        nearestNeighborsCache[pointIndex] = nnDirections;

        return nnDirections;
    };

    function getLinkFromDoi(doi, journal) {
        if (journal === "Digital Humanities Quarterly") {
            doi = doi.substring(4)
            return "<a href='http://www.digitalhumanities.org/dhq/findIt?queryString=" + doi + "' target='blank'  rel='noopener noreferrer'>dhq/" + doi + "</a>"
        } else if (journal === "Computational Linguistics") {
            return "<a href='https://www.aclweb.org/anthology/" + doi + "' target='blank'  rel='noopener noreferrer'>" + doi + "</a>"
        } else {
            return "<a href='https://doi.org/" + doi + "' target='blank'  rel='noopener noreferrer'>" + doi + "</a>"
        }
    };

    function fillArticleTable(doi) {
        let articleData = getArticleInfo(doi);
        for (let key of Object.keys(articleData)) {
            console.log(key);
            let cell = document.getElementById(key);
            if (cell) {
                if (key === "doiValue") {
                    cell.innerHTML = getLinkFromDoi(articleData[key], articleData["journalValue"]);
                } else {
                    cell.innerHTML = articleData[key];
                }
            }
        }
        fillArticleTopics(doi);
    }

    function displayArticleInfo() {
        if (!selectedArticle) {
            return;
        }
        var screenPosition = octreeHelper.getScreenPosition(selectedArticle);
        let articleInfo = document.getElementById('articleInfo');
        articleInfo.style.left = screenPosition[0] + "px";
        articleInfo.style.top = screenPosition[1] + "px";
        let bgColor = disciplineColorsUnselected[docData[doiValues[selectedArticle]]["discipline"]];
        articleInfo.style.backgroundColor = "rgba(" + bgColor[0] + ", " + bgColor[1] + ", " + bgColor[2] + ", 0.8)";
        fillArticleTable(doiValues[selectedArticle]);
        articleInfo.style.display = "block";
        getAdjacencyMatrixFiltered();
    }

    document.addEventListener('mousewheel', function(e) {
        pointHelper.setPointScale(4.0 * (1 / lore.controls.camera.zoom**0.66));
    });

    var disciplinePrint = {'digital_humanities': 'Digital Humanities',
    'information_science': 'Information Science',
    'computational_linguistics': 'Computational Linguistics',
    'linguistics': 'Linguistics',
    'applied_cs': 'Applied Computer Science',
    'theoretical_cs': 'Theoretical Computer Science',
    'mathematics': 'Mathematics',
    'statistics': 'Statistics',
    'sociology': 'Sociology',
    'political_science': 'Political Science',
    'history': 'History',
    'literary_theory': 'Literary Theory',
    'art_history': 'Art History',
    'philosophy': 'Philosophy',
    'musicology': 'Musicology',
    'classical_studies': 'Classical Studies'};

    function isCharacterALetter(char) {
        return (/[a-zA-Z\u00C0-\u017F]/).test(char)
      }
    
    function capitalize(words) {
        var separateWord = words.toLowerCase().split(' ');
        for (var i = 0; i < separateWord.length; i++) {
            for (var j = 0; j < separateWord[i].length; j++) {
                if (isCharacterALetter(separateWord[i].charAt(j))) {
                    separateWord[i] = separateWord[i].substring(0, j) 
                    + separateWord[i].charAt(j).toUpperCase()
                    + separateWord[i].substring(j + 1);
                    break;
                }
            }
           
        }
        return separateWord.join(' ');
     }

    function fillArticleTopics(doi) {
        let topics = docData[doi]["top_topics"];
        let topicsSorted = Object.keys(topics).sort(function(a,b){return topics[b]-topics[a]});
        let topicBarChart = document.getElementById("topicBarChart");
        topicBarChart.innerHTML = "";
        for (var i = 0; i < Math.min(topicsSorted.length, 10); i++) {
            let topicIdx = topicsSorted[i];
            let terms = getTopicTerms(topicIdx);
            let valuePercent = Math.round(topics[topicIdx] * 1000) / 10;
            let valuePercentAdj = Math.min(100, valuePercent * 2)
            topicStr = "[" + topicIdx + "] " + terms.slice(0, 5).join(", ")
            bar = document.createElement("div");
            bar.classList.add('topicBar');
            bar.innerHTML = "<span class='valueText'>" + 
                valuePercent.toString() + "%</span>";
            bar.style.top = (i * 20).toString() + "px";
            bar.style.width = valuePercentAdj.toString() + "%";
            topicBarChart.appendChild(bar);
            text = document.createElement("div");
            text.innerHTML = topicStr;
            text.classList.add("topicBarText");
            text.style.top = (i * 20).toString() + "px";
            topicBarChart.appendChild(text);
        }
    }
    
    function getArticleInfo(doi) {
        let title = capitalize(docData[doi]["title"]);
        let authors = capitalize(docData[doi]["authors"].join(" / "));
        let discipline = disciplinePrint[docData[doi]["discipline"]];
        let journal = docData[doi]["journal"];
        let year = docData[doi]["year"];
        if (journal === "Digital Humanities Quarterly") {
            doi = "dhq/" + doi;
        }
        return {
            "doiValue" : doi,
            "titleValue" : title,
            "authorsValue" : authors,
            "disciplineValue" : discipline,
            "journalValue" : journal,
            "yearValue" : year
        }
    }
    
    var articleListEntries = [];
    
    function initArticleList() {
        let articleList = document.getElementById('articleSearchBox');
        articleList.setAttribute("onkeyup","processArticleSearch(this);");
        for (var idx = 0; idx < doiValues.length; idx++) {
            let doi = doiValues[idx];
            let articleInfos = getArticleInfo(doi);
            var li = document.createElement("button");
            li.appendChild(document.createTextNode(articleInfos["titleValue"]
            + " (" + articleInfos["yearValue"] + "; " + articleInfos["authorsValue"] + "; " 
            + articleInfos["doiValue"] + ")"));
            li.value = idx;
            let bgColor = disciplineColorsUnselected[docData[doi]["discipline"]];
            li.style.backgroundColor = "rgba(" + bgColor[0] + ", " + bgColor[1] + ", " + bgColor[2] + ", 0.5)";
            articleListEntries.push(li);
        }
    }
    
    function processArticleSearch(elem) {
        let articleList = document.getElementById('articleList');
        let searchTerms = elem.value.trim().split(" ");
    
        if (elem.value.trim().length > 2) {
            elem.classList.add("dropdown");

            if (articleList == null) {
                articleList = document.createElement("div");
                articleList.id = "articleList";
                elem.parentNode.appendChild(articleList);
            }
            articleList.innerHTML = "<br>";
            let empty = true;

            for (let entry of articleListEntries) {
                let textNode = entry.firstChild;
                let match = false;

                for (let term of searchTerms) {
                    if (textNode.data.toLowerCase().indexOf(term.toLowerCase()) !== -1) {
                        match = true;
                    } else {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    entry.setAttribute("onclick", "processArticleSelect(this);");
                    entry.setAttribute("onmouseover", "processArticleListHover(this);");
                    articleList.appendChild(entry);
                    empty = false;
                }
            }
            if (empty == true) {
                let option = document.createElement("button");
                option.disabled = true;
                option.innerHTML = "No results";
                articleList.appendChild(option);
            }
        } else {
            if (articleList !== null) {
                articleList.parentNode.removeChild(articleList);
                elem.classList.remove("dropdown");
            }
        }
    }

    function processArticleListHover(elem) {
        selectedArticle = elem.value;
        nearestNeighbors = getNearestNeighbors(selectedArticle);
        selectedBySearch = true;
        displayArticleInfo();
    }
    
    function processArticleSelect(elem) {
        let articleSearchBox = document.getElementById('articleSearchBox');
        articleSearchBox.classList.remove("dropdown");
        articleSearchBox.value = "";
        elem.parentNode.parentNode.removeChild(elem.parentNode);
        selectedArticle = elem.value;
        nearestNeighbors = getNearestNeighbors(selectedArticle);
        selectedBySearch = true;
        lore.controls.setLookAt(pointHelper.getPosition(selectedArticle));
        displayArticleInfo();
    }

    function closeArticleInfo() {
        let articleInfoBox = document.getElementById("articleInfo");
        articleInfoBox.style.display = "none";
        articleInfoBox.style.pointerEvents = "none";
        hardSelect = false;
    }

    document.getElementById("closeBtn").addEventListener("click", function(e) {
        closeArticleInfo();
    });