///<reference path='./typings/tsd.d.ts'/>
///<reference path="./localTypings/webglutils.d.ts"/>

/*
 * Portions of this code are
 * Copyright 2015, Blair MacIntyre.
 * 
 * Portions of this code taken from http://webglfundamentals.org, at https://github.com/greggman/webgl-fundamentals
 * and are subject to the following license.  In particular, from 
 *    http://webglfundamentals.org/webgl/webgl-less-code-more-fun.html
 *    http://webglfundamentals.org/webgl/resources/primitives.js
 * 
 * Those portions Copyright 2014, Gregg Tavares.
 * All rights reserved.
 */

import loader = require('./loader');
//import textureUtils = require('./textureUtils');
import f3d = require('./f3d');

////////////////////////////////////////////////////////////////////////////////////////////
// stats module by mrdoob (https://github.com/mrdoob/stats.js) to show the performance 
// of your graphics
var stats = new Stats();
stats.setMode( 1 ); // 0: fps, 1: ms, 2: mb

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '0px';
stats.domElement.style.top = '0px';

document.body.appendChild( stats.domElement );
var defaultAlpha = 0;
////////////////////////////////////////////////////////////////////////////////////////////
// utilities
var rand = function(min: number, max?: number) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max - min);
};

var randInt = function(range) {
  return Math.floor(Math.random() * range);
};

////////////////////////////////////////////////////////////////////////////////////////////
// get some of our canvas elements that we need
var canvas = <HTMLCanvasElement>document.getElementById("webgl");  
var filename = <HTMLInputElement>document.getElementById("filename");
var fileSelection = <HTMLSelectElement>document.getElementById("files");
var progressGuage = <HTMLProgressElement>document.getElementById("progress");
progressGuage.style.visibility = "hidden";

////////////////////////////////////////////////////////////////////////////////////////////
// our objects!

// when a new mesh comes in, we will process it on the next frame of the update.
// to tell the update we have a new mesh, set the newObject variable to it's data
var newObject = undefined;

// the current object being displayed
var object = undefined;

function getMidPt(a: loader.Vertex, b: loader.Vertex) : loader.Vertex {
  var res = addVertex(a, b);
  return [res[0] / 2, res[1] / 2, res[2] / 2];
}

function crossVertex(a: loader.Vertex, b: loader.Vertex): loader.Vertex {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function addVertex(a: loader.Vertex, b: loader.Vertex) : loader.Vertex {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVertex(s: number, a: loader.Vertex) : loader.Vertex {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(a: loader.Vertex) : loader.Vertex {
  var norm = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  if (norm != 0) {
    return [a[0] / norm, a[1] / norm, a[2] / norm];
  } else {
    return a;
  }
}

function vertexTo(a: loader.Vertex, b: loader.Vertex) : loader.Vertex {
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

function constructVertexList(position: Float32Array) : Array<loader.Vertex> {
  var res: Array<loader.Vertex> = [];
  for (var ii = 0; ii < position.length; ii += 3) {
    res.push([position[ii], position[ii + 1], position[ii + 2]]);
  }
  return res;
}

function constructOppoTable(cornerTableV: Array<Array<number>>, numTris: number) {
  for (var ii = 0; ii < numTris * 3; ii++) {
    for (var jj = ii + 1; jj < numTris * 3; jj++) {
      if ((Cvertex(nextC(ii), cornerTableV) == Cvertex(prevC(jj), cornerTableV)) && (Cvertex(prevC(ii), cornerTableV) == Cvertex(nextC(jj), cornerTableV))) {
        cornerTableV[ii][1] = jj;
        cornerTableV[jj][1] = ii;
      }
    }
  }
}

function triNum(corner: number) : number {
  return Math.floor(corner / 3);
}
  
function nextC(corner: number) : number {
  return (3 * triNum(corner) + (corner + 1) % 3);
}
  
function prevC(corner: number) : number {
  return nextC(nextC(corner));
}

function Cvertex(corner: number, cornerTableV: Array<Array<number>>) : number {
  return cornerTableV[corner][0];
}
function oppoC(corner: number, cornerTableV: Array<Array<number>>) : number {
  return cornerTableV[corner][1];
}
  
function leftC(corner: number, cornerTableV: Array<Array<number>>) : number {
  return oppoC(nextC(corner), cornerTableV);
}
  
function rightC(corner: number, cornerTableV: Array<Array<number>>) : number {
  return oppoC(prevC(corner), cornerTableV);
}
  
function swingC(corner: number, cornerTableV: Array<Array<number>>) : number {
  if (cornerTableV[nextC(corner)][1] == -1) {
    while (cornerTableV[prevC(corner)][1] != -1) {
      corner = unswingC(corner, cornerTableV);
    }
    return corner;
  }
  return nextC(leftC(corner, cornerTableV));
}
  
function unswingC(corner: number, cornerTableV: Array<Array<number>>) : number {
  if (cornerTableV[prevC(corner)][1] == -1) {
    while (cornerTableV[nextC(corner)][1] != -1) {
      corner = swingC(corner, cornerTableV);
    }
    return corner;   
  }
  return prevC(rightC(corner, cornerTableV));
}

////////////////////////////////////////////////////////////////////////////////////////////
// stub's for  callbacks for the model downloader. They don't do much yet
//
// called when the mesh is successfully downloaded
var onLoad = function (mesh: loader.Mesh) {
  progressGuage.value = 100;
  progressGuage.style.visibility = "hidden";
	console.log("got a mesh: " + mesh);
  
  // the vertex array and the triangle array are different lengths.
  // we need to create new arrays that are not nested
  // - position: 3 entries per vertex (x, y, z)
  // - normals: 3 entries per vertex (x, y, z), the normal of the corresponding vertex 
  // - colors: 4 entries per vertex (r, g, b, a), in the range 0-255
  // - indices: 3 entries per triangle, each being an index into the vertex array. 
  var numVerts = mesh.v.length;
  var numTris = mesh.t.length;
  var cornerTableV:Array<Array<number>> = [];
  for (var ii = 0; ii < numTris; ii++) {
    cornerTableV.push([mesh.t[ii][0], -1]);
    cornerTableV.push([mesh.t[ii][2], -1]);
    cornerTableV.push([mesh.t[ii][1], -1]);
  }
  // for (var ii = 0; ii < numTris * 3; ii++) {
  //   for (var jj = ii + 1; jj < numTris * 3; jj++) {
  //     if ((Cvertex(nextC(ii), cornerTableV) == Cvertex(prevC(jj), cornerTableV)) && (Cvertex(prevC(ii), cornerTableV) == Cvertex(nextC(jj), cornerTableV))) {
  //       cornerTableV[ii][1] = jj;
  //       cornerTableV[jj][1] = ii;
  //     }
  //   }
  // }
  constructOppoTable(cornerTableV, numTris);
  // GOAL: you need to fill in these arrays with the data for the vertices! 
  var position = [];
  var color = [];
  var normal = [];
  // this is where you put the triangle vertex list
  var indices = [];
  var prenormal: Array<Array<number>> = [];
  //////////////
  ///////// YOUR CODE HERE TO TAKE THE MESH OBJECT AND CREATE ALL THE INFORMATION NEEDED TO RENDER
  //////////////
  var maxX = Number.NEGATIVE_INFINITY;
  var maxY = Number.NEGATIVE_INFINITY;
  var maxZ = Number.NEGATIVE_INFINITY;
  var minX = Number.POSITIVE_INFINITY;
  var minY = Number.POSITIVE_INFINITY;
  var minZ = Number.POSITIVE_INFINITY;
  for (var ii = 0; ii < numVerts; ii++) {
    position.push.apply(position, mesh.v[ii]);
    maxX = Math.max(mesh.v[ii][0], maxX);
    maxY = Math.max(mesh.v[ii][1], maxY);
    maxZ = Math.max(mesh.v[ii][2], maxZ);
    minX = Math.min(mesh.v[ii][0], minX);
    minY = Math.min(mesh.v[ii][1], minY);
    minZ = Math.min(mesh.v[ii][2], minZ);
    var tempc = chroma.hsv(rand(360), 0.5, 1);
    var mycolor = tempc.rgba();
    color.push.apply(color, mycolor);
    prenormal.push(undefined);
  }
  
  for (var ii = 0; ii < numTris; ii++) {
    indices.push(mesh.t[ii][0]);
    indices.push(mesh.t[ii][1]);
    indices.push(mesh.t[ii][2]);
  }
  
  for (var ii = 0; ii < numTris * 3; ii++) {
    if (prenormal[Cvertex(ii, cornerTableV)] == undefined) {
      var currC = ii;
      var nextS = swingC(ii, cornerTableV);
      var sumOfNormal: loader.Vertex = [0,0,0];
      do {
        sumOfNormal = addVertex(sumOfNormal, crossVertex(mesh.v[Cvertex(nextC(nextS), cornerTableV)], mesh.v[Cvertex(nextC(currC), cornerTableV)]));
        currC = nextS;
        nextS = swingC(nextS, cornerTableV);
      } while (currC != ii);
      prenormal[Cvertex(ii, cornerTableV)] = normalize(sumOfNormal);
    }
  }
  
  for (var ii = 0; ii < numVerts; ii++) {
    normal.push.apply(normal, prenormal[ii]);
  }
  console.log(normal);
  // bb1 and bb2 are the corners of the bounding box of the object.  
  var bb1 = vec3.fromValues(maxX, maxY, maxZ);
  var bb2 = vec3.fromValues(minX, minY, minZ);
  
  // Setup the new object.  you can add more data to this object if you like
  // to help with subdivision (for example)
  newObject = {
    boundingBox: [bb2, bb1],
    scaleFactor: 300 / vec3.distance(bb2, bb1),  // FIX!  the scale should be such that the largest view of the object is 300 units
    center: [(maxX + minX) / 2, (maxY + minY) / 2, (maxZ + minZ) / 2],  // FIX!  the center of the object
    numElements: indices.length,
    arrays: {
      position: new Float32Array(position),
      normal: new Float32Array(normal),
      color: new Uint8Array(color),
      indices: new Uint16Array(indices)
    }
  };
}

// called periodically during download.  Some servers set the file size so 
// progres.lengthComputable is true, which lets us compute the progress
var onProgress = function (progress: ProgressEvent) {
  if (progress.lengthComputable) {
    progressGuage.value = progress.loaded / progress.total * 100;
  }
	console.log("loading: " + progress.loaded + " of " + progress.total +  "...");
}

// of there's an error, this will be called.  We'll log it to the console
var onError = function (error: ErrorEvent) {
	console.log("error! " + error);
}

// HTML dom element callback functions.  Putting them on the window object makes 
// them visible to the DOM elements
window["jsonFileChanged"] = () => {
   // we stored the filename in the select option items value property 
   filename.value = fileSelection.value;
}

window["loadModel"] = () => {
    // reset and show the progress bar
    progressGuage.max = 100;
    progressGuage.value = 0;
    progressGuage.style.visibility = "visible";
    
    // attempt to download the modele
    loader.loadMesh("models/" + filename.value, onLoad, onProgress, onError);
}
 
window["onSubdivide"] = () => {
  console.log("Subdivide called!  You should do the subdivision!");
  if (object) {
    var cornerTableV: Array<Array<number>> = [];
    var vertexList = constructVertexList(object.arrays.position);
    for (var ii = 0; ii < object.numElements; ii += 3) {
      cornerTableV.push([object.arrays.indices[ii], -1]);
      cornerTableV.push([object.arrays.indices[ii + 2], -1]);
      cornerTableV.push([object.arrays.indices[ii + 1], -1]);
    }
    constructOppoTable(cornerTableV, object.numElements / 3);
    var midPtTable = [];
    for (var ii = 0; ii < object.numElements; ii++) {
      if (oppoC(ii, cornerTableV) == -1) {
        vertexList.push(getMidPt(vertexList[Cvertex(nextC(ii), cornerTableV)], vertexList[Cvertex(prevC(ii), cornerTableV)]));
        midPtTable[ii] = vertexList.length - 1;
      } else if (ii < oppoC(ii, cornerTableV)) {
        vertexList.push(getMidPt(vertexList[Cvertex(nextC(ii), cornerTableV)], vertexList[Cvertex(prevC(ii), cornerTableV)]));
        midPtTable[oppoC(ii, cornerTableV)] = vertexList.length - 1;
        midPtTable[ii] = vertexList.length - 1;
      }
    }
    var tempVList = vertexList.slice();
    for (var ii = 0; ii < object.numElements; ii++) {
      if ((oppoC(ii, cornerTableV) != -1) && (ii < oppoC(ii, cornerTableV))) {
        if (oppoC(prevC(ii), cornerTableV) != -1 &&
            oppoC(nextC(ii), cornerTableV) != -1 &&
            oppoC(prevC(oppoC(ii, cornerTableV)), cornerTableV) != -1 &&
            oppoC(nextC(oppoC(ii, cornerTableV)), cornerTableV) != -1) {
          var midp1 = getMidPt(vertexList[Cvertex(leftC(ii, cornerTableV), cornerTableV)], vertexList[Cvertex(rightC(ii, cornerTableV), cornerTableV)]);
          var midp2 = getMidPt(vertexList[Cvertex(leftC(oppoC(ii, cornerTableV), cornerTableV), cornerTableV)], vertexList[Cvertex(rightC(oppoC(ii, cornerTableV), cornerTableV), cornerTableV)]);
          var midp3 = getMidPt(vertexList[Cvertex(ii, cornerTableV)], vertexList[Cvertex(oppoC(ii, cornerTableV), cornerTableV)]);
          var midp4 = vertexTo(getMidPt(midp1, midp2), midp3);
          midp4 = scaleVertex(0.25, midp4);
          tempVList[midPtTable[ii]] = addVertex(vertexList[midPtTable[ii]], midp4);
        }
      }
    }
    vertexList = tempVList;
    var numTris = object.numElements / 3;
    for (var ii = 0; ii < numTris*3; ii+=3) {
      cornerTableV[3 * numTris + ii] = [Cvertex(ii, cornerTableV), -1];
      cornerTableV[nextC(3 * numTris + ii)] = [midPtTable[prevC(ii)], -1];
      cornerTableV[prevC(3 * numTris + ii)] = [midPtTable[nextC(ii)], -1];
      //--------------------------------------------------------------------------------------
      cornerTableV[6 * numTris + ii] = [Cvertex(nextC(ii), cornerTableV), -1];
      cornerTableV[nextC(6 * numTris + ii)] = [midPtTable[ii], -1];
      cornerTableV[prevC(6 * numTris + ii)] = [midPtTable[prevC(ii)], -1];
      //--------------------------------------------------------------------------------------
      cornerTableV[9 * numTris + ii] = [Cvertex(prevC(ii), cornerTableV), -1];
      cornerTableV[nextC(9 * numTris + ii)] = [midPtTable[nextC(ii)], -1];
      cornerTableV[prevC(9 * numTris + ii)] = [midPtTable[ii], -1];
      //--------------------------------------------------------------------------------------
      cornerTableV[ii] = [midPtTable[ii], -1];
      cornerTableV[nextC(ii)] = [midPtTable[nextC(ii)], -1];
      cornerTableV[prevC(ii)] = [midPtTable[prevC(ii)], -1];
    }
    numTris = numTris * 4
    var numVerts = vertexList.length;
    constructOppoTable(cornerTableV, numTris);
    //----------------------------------------------------------------------------------------
    //Construct object and array like onLoad
    var position = [];
    var color = [];
    var normal = [];
    // this is where you put the triangle vertex list
    var indices = [];
    var prenormal: Array<Array<number>> = [];
    //////////////
    ///////// YOUR CODE HERE TO TAKE THE MESH OBJECT AND CREATE ALL THE INFORMATION NEEDED TO RENDER
    //////////////
    var maxX = Number.NEGATIVE_INFINITY;
    var maxY = Number.NEGATIVE_INFINITY;
    var maxZ = Number.NEGATIVE_INFINITY;
    var minX = Number.POSITIVE_INFINITY;
    var minY = Number.POSITIVE_INFINITY;
    var minZ = Number.POSITIVE_INFINITY;
    for (var ii = 0; ii < numVerts; ii++) {
      position.push.apply(position, vertexList[ii]);
      maxX = Math.max(vertexList[ii][0], maxX);
      maxY = Math.max(vertexList[ii][1], maxY);
      maxZ = Math.max(vertexList[ii][2], maxZ);
      minX = Math.min(vertexList[ii][0], minX);
      minY = Math.min(vertexList[ii][1], minY);
      minZ = Math.min(vertexList[ii][2], minZ);
      var tempc = chroma.hsv(rand(360), 0.5, 1);
      var mycolor = tempc.rgba();
      color.push.apply(color, mycolor);
      prenormal.push(undefined);
    }
    for (var ii = 0; ii < numTris; ii++) {
      indices.push(cornerTableV[3 * ii][0]);
      indices.push(cornerTableV[3 * ii + 2][0]);
      indices.push(cornerTableV[3 * ii + 1][0]);
    }
    
    for (var ii = 0; ii < numTris * 3; ii++) {
      if (prenormal[Cvertex(ii, cornerTableV)] == undefined) {
        var currC = ii;
        var nextS = swingC(ii, cornerTableV);
        var sumOfNormal: loader.Vertex = [0,0,0];
        do {
          sumOfNormal = addVertex(sumOfNormal, crossVertex(vertexList[Cvertex(nextC(nextS), cornerTableV)], vertexList[Cvertex(nextC(currC), cornerTableV)]));
          currC = nextS;
          nextS = swingC(nextS, cornerTableV);
        } while (currC != ii);
        prenormal[Cvertex(ii, cornerTableV)] = normalize(sumOfNormal);
      }
    }
    
    for (var ii = 0; ii < numVerts; ii++) {
      normal.push.apply(normal, prenormal[ii]);
    }
    
    var bb1 = vec3.fromValues(maxX, maxY, maxZ);
    var bb2 = vec3.fromValues(minX, minY, minZ);
    
    // Setup the new object.  you can add more data to this object if you like
    // to help with subdivision (for example)
    newObject = {
      boundingBox: [bb2, bb1],
      scaleFactor: 300 / vec3.distance(bb2, bb1),  // FIX!  the scale should be such that the largest view of the object is 300 units
      center: [(maxX + minX) / 2, (maxY + minY) / 2, (maxZ + minZ) / 2],  // FIX!  the center of the object
      numElements: indices.length,
      arrays: {
        position: new Float32Array(position),
        normal: new Float32Array(normal),
        color: new Uint8Array(color),
        indices: new Uint16Array(indices)
      }
    };
    
  }
} 

////////////////////////////////////////////////////////////////////////////////////////////
// some simple interaction using the mouse.
// we are going to get small motion offsets of the mouse, and use these to rotate the object
//
// our offset() function from assignment 0, to give us a good mouse position in the canvas 
function offset(e: MouseEvent): GLM.IArray {
    e = e || <MouseEvent> window.event;

    var target = <Element> e.target || e.srcElement,
        rect = target.getBoundingClientRect(),
        offsetX = e.clientX - rect.left,
        offsetY = e.clientY - rect.top;

    return vec2.fromValues(offsetX, offsetY);
}

var mouseStart = undefined;  // previous mouse position
var mouseDelta = undefined;  // the amount the mouse has moved
var mouseAngles = vec2.create();  // angle offset corresponding to mouse movement

// start things off with a down press
canvas.onmousedown = (ev: MouseEvent) => {
    mouseStart = offset(ev);        
    mouseDelta = vec2.create();  // initialize to 0,0
    vec2.set(mouseAngles, 0, 0);
}

// stop things with a mouse release
canvas.onmouseup = (ev: MouseEvent) => {
    if (mouseStart != undefined) {
        const clickEnd = offset(ev);
        vec2.sub(mouseDelta, clickEnd, mouseStart);        // delta = end - start
        vec2.scale(mouseAngles, mouseDelta, 10/canvas.height);  

        // now toss the two values since the mouse is up
        mouseDelta = undefined;
        mouseStart = undefined; 
    }
}

// if we're moving and the mouse is down        
canvas.onmousemove = (ev: MouseEvent) => {
    if (mouseStart != undefined) {
      const m = offset(ev);
      vec2.sub(mouseDelta, m, mouseStart);    // delta = mouse - start 
      vec2.copy(mouseStart, m);               // start becomes current position
      vec2.scale(mouseAngles, mouseDelta, 10/canvas.height);

      // console.log("mousemove mouseAngles: " + mouseAngles[0] + ", " + mouseAngles[1]);
      // console.log("mousemove mouseDelta: " + mouseDelta[0] + ", " + mouseDelta[1]);
      // console.log("mousemove mouseStart: " + mouseStart[0] + ", " + mouseStart[1]);
   }
}

// stop things if you move out of the window
canvas.onmouseout = (ev: MouseEvent) => {
    if (mouseStart != undefined) {
      vec2.set(mouseAngles, 0, 0);
      mouseDelta = undefined;
      mouseStart = undefined;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////
// start things off by calling initWebGL
initWebGL();

function initWebGL() {
  // get the rendering context for webGL
  var gl: WebGLRenderingContext = getWebGLContext(canvas);
  if (!gl) {
    return;  // no webgl!  Bye bye
  }

  // turn on backface culling and zbuffering
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  // attempt to download and set up our GLSL shaders.  When they download, processed to the next step
  // of our program, the "main" routing
  loader.loadFiles(['shaders/a3-shader.vert', 'shaders/a3-shader.frag'], function (shaderText) {
    var program = createProgramFromSources(gl, shaderText);
    main(gl, program);
  }, function (url) {
      alert('Shader failed to download "' + url + '"');
  }); 
}

////////////////////////////////////////////////////////////////////////////////////////////
// webGL is set up, and our Shader program has been created.  Finish setting up our webGL application       
function main(gl: WebGLRenderingContext, program: WebGLProgram) {
  
  // use the webgl-utils library to create setters for all the uniforms and attributes in our shaders.
  // It enumerates all of the uniforms and attributes in the program, and creates utility functions to 
  // allow "setUniforms" and "setAttributes" (below) to set the shader variables from a javascript object. 
  // The objects have a key for each uniform or attribute, and a value containing the parameters for the
  // setter function
  var uniformSetters = createUniformSetters(gl, program);
  var attribSetters  = createAttributeSetters(gl, program);

  /// ***************
  /// This code creates the initial 3D "F".  You can look here for guidance on what some of the elements
  /// of the "object" are, and may want to use the debugger to look at the content of the fields of the "arrays" 
  /// object returned from f3d.createArrays(gl) 
  var arrays = f3d.createArrays(gl);
  var bb1 = vec3.fromValues(100, 150, 30);
  var bb2 = vec3.fromValues(0, 0, 0);
  object = {
    boundingBox: [bb2,bb1],
    scaleFactor: 300/vec3.distance(bb1,bb2), 
    center: [50, 75, 15],
    numElements: arrays.indices.length,
    arrays: arrays 
  }
  
  var buffers = {
    position: gl.createBuffer(),
    //texcoord: gl.createBuffer(),
    normal: gl.createBuffer(),
    color: gl.createBuffer(),
    indices: gl.createBuffer()
  };
  object.buffers = buffers;
      
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);
  //gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);
  //gl.bufferData(gl.ARRAY_BUFFER, arrays.texcoord, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, arrays.color, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);
  
  var attribs = {
    a_position: { buffer: buffers.position, numComponents: 3, },
    a_normal:   { buffer: buffers.normal,   numComponents: 3, },
    //a_texcoord: { buffer: buffers.texcoord, numComponents: 2, },
    a_color:    { buffer: buffers.color,    numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true  }
  };

  /// you will need to set up your arrays and then create your buffers
  /// ********************
  
  
  function degToRad(d) {
    return d * Math.PI / 180;
  }

  var cameraAngleRadians = degToRad(0);
  var fieldOfViewRadians = degToRad(60);
  var cameraHeight = 50;

  var uniformsThatAreTheSameForAllObjects = {
    u_lightWorldPos:         [50, 30, -100],
    u_viewInverse:           mat4.create(),
    u_lightColor:            [1, 1, 1, 1],
    u_ambient:               [0.1, 0.1, 0.1, 0.1]
  };

  var uniformsThatAreComputedForEachObject = {
    u_worldViewProjection:   mat4.create(),
    u_world:                 mat4.create(),
    u_worldInverseTranspose: mat4.create(),
  };

  // var textures = [
  //   textureUtils.makeStripeTexture(gl, { color1: "#FFF", color2: "#CCC", }),
  //   textureUtils.makeCheckerTexture(gl, { color1: "#FFF", color2: "#CCC", }),
  //   textureUtils.makeCircleTexture(gl, { color1: "#FFF", color2: "#CCC", }),
  // ];

  var baseColor = rand(240);
  var objectState = { 
      materialUniforms: {
        u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
        //u_diffuse:               textures[randInt(textures.length)],
        u_specular:              [1, 1, 1, 1],
        u_shininess:             450,
        u_specularFactor:        0.75,
      }
  };

  // some variables we'll reuse below
  var projectionMatrix = mat4.create();
  var viewMatrix = mat4.create();
  var rotationMatrix = mat4.create();
  var matrix = mat4.create();  // a scratch matrix
  var invMatrix = mat4.create();
  var axisVector = vec3.create();
  
  requestAnimationFrame(drawScene);

  // Draw the scene.
  function drawScene(time: number) {
    time *= 0.001; 

    // reset the object if a new one has been loaded
    if (newObject) {
      object = newObject;
      newObject = undefined;
      
      arrays = object.arrays;
      buffers = {
        position: gl.createBuffer(),
        //texcoord: gl.createBuffer(),
        normal: gl.createBuffer(),
        color: gl.createBuffer(),
        indices: gl.createBuffer()
      };
      object.buffers = buffers;
      
      // For each of the new buffers, load the array data into it. 
      // first, bindBuffer sets it as the "current Buffer" and then "bufferData"
      // loads the data into it.  Each array (vertex, color, normal, texture coordinates)
      // has the same number of entries, and is used together by the shaders when it's
      // index is referenced by the index array for the triangle list
      
      // vertex positions
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);

      // texture coordinates
      //gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);
      //gl.bufferData(gl.ARRAY_BUFFER, arrays.texcoord, gl.STATIC_DRAW);

      // vertex normals
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);

      // vertex colors
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
      gl.bufferData(gl.ARRAY_BUFFER, arrays.color, gl.STATIC_DRAW);

      // triangle indices.  
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);

      // the attribute data to be used by the "setAttributes" utility function
      attribs = {
        a_position: { buffer: buffers.position, numComponents: 3, },
        a_normal:   { buffer: buffers.normal,   numComponents: 3, },
        //a_texcoord: { buffer: buffers.texcoord, numComponents: 2, },
        a_color:    { buffer: buffers.color,    numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true  }
      }; 
      
      // reset the rotation matrix
      //rotationMatrix = mat4.identity(rotationMatrix);     
    }    
   
    // measure time taken for the little stats meter
    stats.begin();

    // if the window changed size, reset the WebGL canvas size to match.  The displayed size of the canvas
    // (determined by window size, layout, and your CSS) is separate from the size of the WebGL render buffers, 
    // which you can control by setting canvas.width and canvas.height
    resizeCanvasToDisplaySize(canvas);

    // Set the viewport to match the canvas
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the projection matrix
    var aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(projectionMatrix,fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, -200];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = mat4.lookAt(uniformsThatAreTheSameForAllObjects.u_viewInverse, cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    mat4.invert(viewMatrix, cameraMatrix);
    
    // tell WebGL to use our shader program.  probably don't need to do this each time, since we aren't
    // changing it, but it doesn't hurt in this simple example.
    gl.useProgram(program);
    
    // Setup all the needed attributes.   This utility function does the following for each attribute, 
    // where "index" is the index of the shader attribute found by "createAttributeSetters" above, and
    // "b" is the value of the entry in the "attribs" array cooresponding to the shader attribute name:
    //   gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
    //   gl.enableVertexAttribArray(index);
    //   gl.vertexAttribPointer(
    //     index, b.numComponents || b.size, b.type || gl.FLOAT, b.normalize || false, b.stride || 0, b.offset || 0);    
    setAttributes(attribSetters, attribs);

    // Bind the indices for use in the index-based drawElements below
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

    // Set the uniforms that are the same for all objects.  Unlike the attributes, each uniform setter
    // is different, depending on the type of the uniform variable.  Look in webgl-util.js for the
    // implementation of  setUniforms to see the details for specific types       
    setUniforms(uniformSetters, uniformsThatAreTheSameForAllObjects);
   
    ///////////////////////////////////////////////////////
    // Compute the view matrix and corresponding other matrices for rendering.
    
    // first make a copy of our rotationMatrix
    mat4.copy(matrix, rotationMatrix);
    
    // adjust the rotation based on mouse activity.  mouseAngles is set if user is dragging 
    if (mouseAngles[0] !== 0 || mouseAngles[1] !== 0) {
      // need an inverse world transform so we can find out what the world X axis for our first rotation is
      mat4.invert(invMatrix, matrix);
      // get the world X axis
      var xAxis = vec3.transformMat4(axisVector, vec3.fromValues(1,0,0), invMatrix);

      // rotate about the world X axis (the X parallel to the screen!)
      mat4.rotate(matrix, matrix, -mouseAngles[1], xAxis);
      
      // now get the inverse world transform so we can find the world Y axis
      mat4.invert(invMatrix, matrix);
      // get the world Y axis
      var yAxis = vec3.transformMat4(axisVector, vec3.fromValues(0,1,0), invMatrix);

      // rotate about teh world Y axis
      mat4.rotate(matrix, matrix, mouseAngles[0], yAxis);
  
      // save the resulting matrix back to the cumulative rotation matrix 
      mat4.copy(rotationMatrix, matrix);
      vec2.set(mouseAngles, 0, 0);        
    }   

    // add a translate and scale to the object World xform, so we have:  R * T * S
    mat4.translate(matrix, rotationMatrix, [-object.center[0]*object.scaleFactor, -object.center[1]*object.scaleFactor, 
                                            -object.center[2]*object.scaleFactor]);
    mat4.scale(matrix, matrix, [object.scaleFactor, object.scaleFactor, object.scaleFactor]);
    mat4.copy(uniformsThatAreComputedForEachObject.u_world, matrix);
    
    // get proj * view * world
    mat4.multiply(matrix, viewMatrix, uniformsThatAreComputedForEachObject.u_world);
    mat4.multiply(uniformsThatAreComputedForEachObject.u_worldViewProjection, projectionMatrix, matrix);

    // get worldInvTranspose.  For an explaination of why we need this, for fixing the normals, see
    // http://www.unknownroad.com/rtfm/graphics/rt_normals.html
    mat4.transpose(uniformsThatAreComputedForEachObject.u_worldInverseTranspose, 
                   mat4.invert(matrix, uniformsThatAreComputedForEachObject.u_world));

    // Set the uniforms we just computed
    setUniforms(uniformSetters, uniformsThatAreComputedForEachObject);

    // Set the uniforms that are specific to the this object.
    setUniforms(uniformSetters, objectState.materialUniforms);

    // Draw the geometry.   Everything is keyed to the ""
    gl.drawElements(gl.TRIANGLES, object.numElements, gl.UNSIGNED_SHORT, 0);

    // stats meter
    stats.end();

    requestAnimationFrame(drawScene);
  }
}