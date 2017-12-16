"use strict";

var canvas;
var gl;
var program;

// uniform 变量
var uniformLoc = {
    objectTransformMatrix: null, 
    modelMatrix: null,
    modelViewMatrix: null,
    projectionMatrix: null,
    ambientProduct:null,
    diffuseProduct:null,
    specularProduct:null,
    shininess: null
};

// 所有要绘制的objects
var all_objects=[];

// camera
var camera = {
    pos:[0, 0, 8],
    look:[0, 0, 0],
    up:[0, 1, 0]
};

// scene transform
var transform = {
    modelMatrix: mat4(
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1
    ),
    modelViewMatrix: lookAt(camera.pos, camera.look, camera.up),
    // projectionMatrix: ortho(-3, 3, -3, 3, 0, 12),
    projectionMatrix: perspective(55,1, 4, 11)
}

// 全局光源
var light = {
    pos: vec4(0.0, 0.0, 0.0, 1.0),       //齐次坐标 最后一个分量为1表示点光源
    ambient: vec4(0.9, 0.9, 0.9, 1.0 ),  //环境光分量
    diffuse: vec4( 1.0, 1.0, 1.0, 1.0 ), //漫反射光分量
    specular: vec4( 1.0, 1.0, 1.0, 1.0 ) //镜面反射光分量
}


function Rotation(axis, angularSpeed){
    this.axis = axis;
    this.angularSpeed =  angularSpeed;
}

// data-struct RenderObject
function RenderObject(transform, pointsArray, normalsArray,texCoordsArray, material, selfRotating=null){
    this.transform = transform;
    this.pointsArray = pointsArray;
    this.normalsArray = normalsArray;
    this.texCoordsArray = texCoordsArray;
    this.material = material;
    this.selfRotating = selfRotating;
}

// data-struct Material
function Material(
    ambient=vec4( 0.5, 0.0, 0.0, 1.0 ),
    diffuse=vec4( 0.5, 0.0, 0.0, 1.0 ),
    specular=vec4( 0.5, 0.5, 0.5, 1.0 ),
    shininess=20.0) {

    this.ambient = ambient;
    this.diffuse = diffuse;
    this.specular = specular;
    this.shininess = shininess;
}

// 创建球体
function createSphere(origin = [0,0,0], material = new Material(), numTimesToSubdivide =4, hasTexture = false){
    // 初始四面体坐标
    var va = vec4(0.0, 0.0, -1.0,1);
    var vb = vec4(0.0, 0.942809, 0.333333, 1);
    var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
    var vd = vec4(0.816497, -0.471405, 0.333333,1);
    var sphere = new RenderObject(translate(origin),[],[],[],material);

    // inner functions
    function triangle(a, b, c) {
        // 计算法向量
        var t1 = subtract(b, a);
        var t2 = subtract(b, c);
        var normal = vec4(cross(t1, t2),0);
        sphere.normalsArray.push(normal);
        sphere.normalsArray.push(normal);
        sphere.normalsArray.push(normal);
        sphere.pointsArray.push([a[0],a[1],a[2], 1]);
        sphere.pointsArray.push([b[0],b[1],b[2], 1]);
        sphere.pointsArray.push([c[0],c[1],c[2], 1]);
        if(hasTexture){
            sphere.texCoordsArray.push([a[0],a[1]]);
            sphere.texCoordsArray.push([b[0],b[1]]);
            sphere.texCoordsArray.push([c[0],c[1]]);
        }else{
            sphere.texCoordsArray.push([0,0]);
            sphere.texCoordsArray.push([0,0]);
            sphere.texCoordsArray.push([0,0]);
        }
        
    }
    
    function divideTriangle(a, b, c, count) {
        if ( count > 0 ) {
            var ab = mix( a, b, 0.5);
            var ac = mix( a, c, 0.5);
            var bc = mix( b, c, 0.5);
    
            ab = normalize(ab, true);
            ac = normalize(ac, true);
            bc = normalize(bc, true);
    
            divideTriangle( a, ab, ac, count - 1 );
            divideTriangle( ab, b, bc, count - 1 );
            divideTriangle( bc, c, ac, count - 1 );
            divideTriangle( ab, bc, ac, count - 1 );
        }
        else {
            triangle( a, b, c);
        }
    }
    
    function tetrahedron(a, b, c, d, n) {
        divideTriangle(a, b, c, n);
        divideTriangle(d, c, b, n);
        divideTriangle(a, d, b, n);
        divideTriangle(a, c, d, n);
    }
    tetrahedron(va,vb,vc,vd, numTimesToSubdivide);
    return sphere;
}

// 创建立方体
function createCube(origin = [0,0,0], material = new Material(), hasTexture = true){
    var texCoords = [
        [vec2(0, 0),vec2(0, 0.5),vec2(0.5, 0.5),vec2(0.5, 0)],
        [vec2(0.5, 0),vec2(0.5, 0.5),vec2(1, 0.5),vec2(1, 0)],
        [vec2(0, 0.5),vec2(0, 1),vec2(0.5, 1),vec2(0.5, 0.5)],
        [vec2(0.5, 0.5),vec2(0.5, 1),vec2(1, 1),vec2(1, 0.5)]
    ];//纹理坐标
    
    var vertices = [
        vec4( -0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5,  0.5,  0.5, 1.0 ),
        vec4( 0.5,  0.5,  0.5, 1.0 ),
        vec4( 0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5, -0.5, -0.5, 1.0 ),
        vec4( -0.5,  0.5, -0.5, 1.0 ),
        vec4( 0.5,  0.5, -0.5, 1.0 ),
        vec4( 0.5, -0.5, -0.5, 1.0 )
    ];//顶点位置

    var cube = new RenderObject(translate(origin),[],[],[],material);

    function quad(a, b, c, d, texCoord) {
        // 计算法向量
        var t1 = subtract(vertices[b], vertices[a]);
        var t2 = subtract(vertices[c], vertices[b]);
        var normal = vec4(cross(t1, t2),0);
    
        cube.pointsArray.push(vertices[a]);
        cube.normalsArray.push(normal); 
        cube.texCoordsArray.push(texCoord[1]);
    
        cube.pointsArray.push(vertices[b]);
        cube.normalsArray.push(normal);
        cube.texCoordsArray.push(texCoord[0]);
    
        cube.pointsArray.push(vertices[c]);
        cube.normalsArray.push(normal); 
        cube.texCoordsArray.push(texCoord[3]);
    
        cube.pointsArray.push(vertices[a]);
        cube.normalsArray.push(normal); 
        cube.texCoordsArray.push(texCoord[1]);
    
        cube.pointsArray.push(vertices[c]);
        cube.normalsArray.push(normal); 
        cube.texCoordsArray.push(texCoord[3]);
    
        cube.pointsArray.push(vertices[d]);
        cube.normalsArray.push(normal); 
        cube.texCoordsArray.push(texCoord[2]);
    }
    
    quad( 1, 0, 3, 2 ,texCoords[1]);
    quad( 2, 3, 7, 6 ,texCoords[3]);
    quad( 3, 0, 4, 7 ,texCoords[3]);
    quad( 6, 5, 1, 2 ,texCoords[3]);
    quad( 4, 5, 6, 7 ,texCoords[2]);
    quad( 5, 4, 0, 1 ,texCoords[3]);

    return cube;
}

////////////////////////////////////////////////////////////////////////////////

// 鼠标跟踪球
var traceball = {
    mousedown: false,
    lastPos: [0, 0, 0],
    angularSpeed: 0.0,
    angularAcceleration: 0.003,
    axis:[0, 0, 0],
    calc_trackball_3d_pos:function(x,y){ //根据点击的二维坐标计算单位球上的3d坐标
        var d, a;
        var v = [];
    
        v[0] = x;
        v[1] = y;
    
        d = v[0]*v[0] + v[1]*v[1];
        if (d < 1.0)
          v[2] = Math.sqrt(1.0 - d);
        else {
          v[2] = 0.0;
          a = 1.0 /  Math.sqrt(d);
          v[0] *= a;
          v[1] *= a;
        }
        return v;
    },
    mouseDown: function(x,y){
        this.angularSpeed = 0;
        this.mousedown = true;
        this.lastPos = this.calc_trackball_3d_pos(x, y);
        this.startMatrix = transform.modelMatrix;
    },
    mouseMotion: function(x,y){
        if(this.mousedown) {
            var curPos = this.calc_trackball_3d_pos(x, y);
            var axis = cross(this.lastPos, curPos);
            var l_axis = length(axis);
            if(l_axis!=0){
                var angle = Math.asin(l_axis);  //单位球, 分母为1
                transform.modelMatrix = mult(rotate(angle*180/Math.PI, axis) ,transform.modelMatrix);
                this.lastPos = curPos;
                this.angularSpeed = angle*2;
                this.axis = axis;
            }
        }
    },
    mouseLoss: function(x,y){
        this.mousedown = false;
    }
}


function setLightPos(radius, theta, phi){
    // 控制光源位置
    light.pos = vec4(radius*Math.cos(phi)*Math.sin(theta),
    radius*Math.sin(phi), radius*Math.cos(phi)*Math.cos(theta), 1);
    gl.uniform4fv(gl.getUniformLocation(program,"uLightPosition"), flatten(light.pos) );
}

var texture; //纹理对象
/*******************创建纹理对象，并设置参数，关联片元着色器中的采样器*********************/
function configureTexture( image ) {
	//创建纹理对象texture并作为当前纹理对象，并装载了数字图像image
    texture = gl.createTexture();//创建纹理对象
    gl.bindTexture( gl.TEXTURE_2D, texture );//绑定为当前2D纹理对象
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);//把纹理对象从顶端翻转到底部（因APP和纹理图像用不同坐标系）
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGB,gl.RGB, gl.UNSIGNED_BYTE, image );//将图像数组image指定为当前二维纹理，即存到纹理内存
	
    /*为当前纹理对象设置大小不同的纹素数组，后面两句是impmapping参数设置*/	
    gl.generateMipmap( gl.TEXTURE_2D );	
	/*gl.TEXTURE_MIN_FILTER：像素比纹素大，单个像素对应多个纹素，纹理需要缩小,
	NEAREST_MIPMAP_LINEAR：采用点采样方式得到相邻的Mipmap纹理， 并且在得到的Mipmap纹理内部使用线性滤波。*/
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_LINEAR );	
	/*gl.TEXTURE_MAG_FILTER：像素比纹素小，多个像素对应单个纹素，纹理需要放大。
	gl.NEAREST :点采样方式得相邻的纹理*/
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );

	//关联当前纹理对象到片元SHADER中的采样器对象texture
    gl.uniform1i(gl.getUniformLocation(program, "texture"), 0);
}


function setObjectAtrributes(object){
    // 顶点 atrributes
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(object.pointsArray), gl.STATIC_DRAW);
    var aPosition = gl.getAttribLocation( program, "aPosition");
    gl.vertexAttribPointer(aPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    // 法向量 atrributes
    var nBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData( gl.ARRAY_BUFFER, flatten(object.normalsArray), gl.STATIC_DRAW );
    var aNormal = gl.getAttribLocation( program, "aNormal" );
    gl.vertexAttribPointer( aNormal, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( aNormal);

    // texture
    var tBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, tBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(object.texCoordsArray), gl.STATIC_DRAW );
    var aTexCoord = gl.getAttribLocation( program, "aTexCoord" );
    gl.vertexAttribPointer( aTexCoord, 2, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( aTexCoord );
    
}

function createObjects(){
    var sphere1 = createSphere([-2.7, 0, 0]);
    sphere1.selfRotating = new Rotation([0,1,0], 1); // 自转

    var sphere2 = createSphere([2.7, 0, 0]);
    sphere2.selfRotating = new Rotation([0,-1,0], 1); // 自转
    sphere2.material.ambient = vec4(0.2,0.2,0.0,1);
    sphere2.material.diffuse = vec4(0.2,0.2,0.0,1);

    var cubeMaterial = new Material();
    cubeMaterial.ambient = vec4(0.2,0.2,0.2,1);
    cubeMaterial.diffuse = vec4(0.5,0.5,0.5,1);
    cubeMaterial.specular = vec4(0.5,0.5,0.5,1);
    cubeMaterial.shininess = 60;
    var cube = createCube([0,0,0], cubeMaterial);
    cube.transform = mult(scalem(2.5,2.5,2.5),cube.transform);
    
    all_objects.push(sphere1);
    all_objects.push(sphere2);
    all_objects.push(cube);
}

//////////////////////////////////////////////////////////////////////////////////////////
window.onload = function init() {
    canvas = document.getElementById( "gl-canvas" );
    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    gl.viewport( 0, 0, canvas.width, canvas.height );
    // 背景颜色
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.enable(gl.DEPTH_TEST);
    // 加载着色器
    program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );
    // 初始化uniform
    uniformLoc.objectTransformMatrix = gl.getUniformLocation( program, "uObjectTransformMatrix")
    uniformLoc.modelMatrix = gl.getUniformLocation( program, "uModelMatrix")
    uniformLoc.modelViewMatrix = gl.getUniformLocation( program, "uModelViewMatrix" );
    uniformLoc.projectionMatrix = gl.getUniformLocation( program, "uProjectionMatrix" );
    uniformLoc.ambientProduct = gl.getUniformLocation(program, "uAmbientProduct");
    uniformLoc.diffuseProduct = gl.getUniformLocation(program, "uDiffuseProduct");
    uniformLoc.specularProduct =  gl.getUniformLocation(program, "uSpecularProduct");
    uniformLoc.shininess = gl.getUniformLocation(program, "uShininess");

    // 固定的uniform变量
    gl.uniformMatrix4fv(uniformLoc.modelViewMatrix, false, flatten(transform.modelViewMatrix));
    gl.uniformMatrix4fv(uniformLoc.projectionMatrix, false, flatten(transform.projectionMatrix));

    // 设置光源位置
    setLightPos(8, 0, 0);

    // 创建模型数据
    createObjects();

    // 鼠标跟踪球
    // canvas 边界
    var bbox = canvas.getBoundingClientRect();
    canvas.addEventListener("mousedown", function(event){
        var x = 2*(event.clientX-bbox.left)/bbox.width-1;
        var y = 2*(bbox.height-(event.clientY-bbox.top))/bbox.height-1;
        traceball.mouseDown(x,y);
    });
    
    canvas.addEventListener("mouseup", function(event){
        var x = 2*(event.clientX-bbox.left)/bbox.width-1;
        var y = 2*(bbox.height-(event.clientY-bbox.top))/bbox.height-1;
        traceball.mouseLoss(x,y);
    });

    canvas.addEventListener("mousemove", function(event){
        var x = 2*(event.clientX-bbox.left)/bbox.width-1;
        var y = 2*(bbox.height-(event.clientY-bbox.top))/bbox.height-1;
        traceball.mouseMotion(x,y);
    });

    canvas.addEventListener("mouseout",function(event){
        var x = 2*(event.clientX-bbox.left)/bbox.width-1;
        var y = 2*(bbox.height-(event.clientY-bbox.top))/bbox.height-1;
        traceball.mouseLoss(x,y);
    });
   
    // 加载纹理
    var image = new Image();
    image.src = "texture.jpg"
	image.onload = function() {
        configureTexture( image );
    }   
    // 绘制
    render();
}

function selfRotate(mat, angle, axis){
    var T = inverse4(mat);
    var R = rotate(angle, axis);
    return mult(mat,mult(R,mult(T,mat)));
}

function render() { 
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 跟踪球惯性移动
    if(!traceball.mousedown && traceball.angularSpeed >= traceball.angularAcceleration) {
        transform.modelMatrix = mult(rotate(traceball.angularSpeed, traceball.axis), transform.modelMatrix );
        // 线性减速
        traceball.angularSpeed -= traceball.angularAcceleration;
    }
    // 场景模型变换
    gl.uniformMatrix4fv(uniformLoc.modelMatrix, false, flatten(transform.modelMatrix) );

    // 绘制所有对象
    for (const object of all_objects) {
        // 传递顶点、法向量、纹理等attributes
        setObjectAtrributes(object);

        // 对象本身的变换（区别于整体场景）
        // 自转
        var rotation = object.selfRotating;
        if(rotation!=null){
            object.transform = selfRotate(object.transform,rotation.angularSpeed,rotation.axis);
        }
        gl.uniformMatrix4fv( uniformLoc.objectTransformMatrix,false, flatten(object.transform));

        // 光照
        var ambientProduct = mult(light.ambient, object.material.ambient);
        var diffuseProduct = mult(light.diffuse, object.material.diffuse);
        var specularProduct = mult(light.specular, object.material.specular);
        // 传递光照相关uniform变量
        gl.uniform4fv( uniformLoc.ambientProduct, flatten(ambientProduct));
        gl.uniform4fv( uniformLoc.diffuseProduct, flatten(diffuseProduct) );
        gl.uniform4fv( uniformLoc.specularProduct, flatten(specularProduct) );
        gl.uniform1f( uniformLoc.shininess, object.material.shininess );

        // 绘制
        gl.drawArrays( gl.TRIANGLES, 0, object.pointsArray.length);
    }
    window.requestAnimFrame(render);
}