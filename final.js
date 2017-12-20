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

// 不透明和透明 objects
var opaque_objects = [];
var transparent_objects = [];

// camera
var camera = {
    pos:[0, 0, 8],
    look:[0, 0, 0],
    up:[0, 1, 0],
    speed:[0, 0, 0],
    fovy: 55, aspect: 1, near: 1.5, far: 140, left:-4,right:4,bottom:-4,top:4,
    ortho: false,  // 是否正交投影
    _modelViewMatrix: null,
    _projectionMatrix: null,
    moveBySpeed:function(){
        this.pos[0]+=this.speed[0];
        this.pos[1]+=this.speed[1];
        this.pos[2]+=this.speed[2];
        this.look[0]+=this.speed[0];
        this.look[1]+=this.speed[1];
        this.look[2]+=this.speed[2];
    },
    apply: function(){
        this._modelViewMatrix = lookAt(this.pos, this.look, this.up);
        if(!this.ortho){
            this._projectionMatrix = perspective(this.fovy, this.aspect, this.near, this.far);
        } else{
            this._projectionMatrix = ortho(this.left, this.right, this.bottom, this.top, this.near, this.far);
        }
        gl.uniformMatrix4fv(uniformLoc.modelViewMatrix, false, flatten(this._modelViewMatrix));
        gl.uniformMatrix4fv(uniformLoc.projectionMatrix, false, flatten(this._projectionMatrix));
    }
};

// scene --整体
var scene = {
    _modelMatrix: rotate(20, [1,0,0]),
    rotate: function(angle,axis){
        this._modelMatrix = mult(rotate(angle, axis) ,this._modelMatrix);
    },
    apply: function(){
        gl.uniformMatrix4fv(uniformLoc.modelMatrix, false, flatten(this._modelMatrix) );
    }
}

// 全局光源
var light = {
    pos: vec4(0.0, 0.0, 0.0, 1.0),       //齐次坐标 最后一个分量为1表示点光源
    ambient: vec3(1.0, 1.0, 1.0 ),  //环境光分量
    diffuse: vec3( 1.0, 1.0, 1.0 ), //漫反射光分量
    specular: vec3( 1.0, 1.0, 1.0 ), //镜面反射光分量
    setPosByPolar: function(radius, theta, phi){
        // 计算光源位置
        this.pos = vec4(radius*Math.cos(phi)*Math.sin(theta),radius*Math.sin(phi), radius*Math.cos(phi)*Math.cos(theta), 1);
    },
    apply:function(){
        gl.uniform4fv(gl.getUniformLocation(program,"uLightPosition"), flatten(this.pos) );
    }
}

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
    rotateByInertia: function(){//惯性移动
        if(!this.mousedown && this.angularSpeed >= this.angularAcceleration) {
            scene.rotate(this.angularSpeed,this.axis);
            this.angularSpeed -= this.angularAcceleration; // 线性减速
        }
    },
    mouseDown: function(x,y){
        this.angularSpeed = 0;
        this.mousedown = true;
        this.lastPos = this.calc_trackball_3d_pos(x, y);
    },
    mouseMotion: function(x,y){
        if(this.mousedown) {
            var curPos = this.calc_trackball_3d_pos(x, y);
            var axis = cross(this.lastPos, curPos);
            var l_axis = length(axis);
            if(l_axis!=0){
                var angle = Math.asin(l_axis);  //单位球, 分母为1
                scene.rotate(angle*180/Math.PI, axis);
                this.lastPos = curPos;
                this.angularSpeed = 0.6 *this.angularSpeed + 0.4 * angle*3;
                this.axis = axis;
            }
        }
    },
    mouseLoss: function(x,y){
        this.mousedown = false;
    }
}

// data-struct Rotation
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
    ambient=vec3( 0.5, 0.0, 0.0),
    diffuse=vec3( 0.35, 0.0, 0.0 ),
    specular=vec3( 0.4, 0.4, 0.4 ),
    shininess=20.0) {

    this.ambient = ambient;
    this.diffuse = diffuse;
    this.specular = specular;
    this.shininess = shininess;
}
//////////////////////////////////////////////////////////////////////////////////////////
// 创建球体
function createSphere(origin = [0,0,0], numTimesToSubdivide =4, material = new Material(), hasTexture = false){
    // 初始四面体坐标
    var va = vec4(0.0, 0.0, -1.0,1);
    var vb = vec4(0.0, 0.942809, 0.333333, 1);
    var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
    var vd = vec4(0.816497, -0.471405, 0.333333,1);
    var sphere = new RenderObject(translate(origin),[],[],[],material);

    // inner functions
    function triangle(a, b, c) {
        // 法向量
        sphere.normalsArray.push([a[0],a[1],a[2], 0]);
        sphere.normalsArray.push([b[0],b[1],b[2], 0]);
        sphere.normalsArray.push([c[0],c[1],c[2], 0]);

        sphere.pointsArray.push([a[0],a[1],a[2], 1]);
        sphere.pointsArray.push([b[0],b[1],b[2], 1]);
        sphere.pointsArray.push([c[0],c[1],c[2], 1]);
        if(hasTexture){
            sphere.texCoordsArray.push(a[0],a[1]);
            sphere.texCoordsArray.push(b[0],b[1]);
            sphere.texCoordsArray.push(c[0],c[1]);
        }else{
            sphere.texCoordsArray.push(0,0);
            sphere.texCoordsArray.push(0,0);
            sphere.texCoordsArray.push(0,0);
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
    var texCoords = [
        [vec2(0, 0),vec2(0, 0.5),vec2(0.5, 0.5),vec2(0.5, 0)],
        [vec2(0.5, 0),vec2(0.5, 0.5),vec2(1, 0.5),vec2(1, 0)],
        [vec2(0, 0.5),vec2(0, 1),vec2(0.5, 1),vec2(0.5, 0.5)],
        [vec2(0.5, 0.5),vec2(0.5, 1),vec2(1, 1),vec2(1, 0.5)]
    ];//纹理坐标

    var cube = new RenderObject(translate(origin),[],[],[],material);

    function quad(a, b, c, d, texCoord) {
        // 计算法向量
        var t1 = subtract(vertices[b], vertices[a]);
        var t2 = subtract(vertices[c], vertices[b]);
        var normal = vec4(cross(t1, t2),0);
        cube.normalsArray.push(normal);
        cube.normalsArray.push(normal);
        cube.normalsArray.push(normal);
        cube.normalsArray.push(normal);
        cube.normalsArray.push(normal);
        cube.normalsArray.push(normal);
    
        cube.pointsArray.push(vertices[a]); 
        cube.pointsArray.push(vertices[b]);
        cube.pointsArray.push(vertices[c]); 
        cube.pointsArray.push(vertices[a]); 
        cube.pointsArray.push(vertices[c]); 
        cube.pointsArray.push(vertices[d]);

        if(hasTexture){
            cube.texCoordsArray.push(texCoord[1]);
            cube.texCoordsArray.push(texCoord[0]);
            cube.texCoordsArray.push(texCoord[3]);
            cube.texCoordsArray.push(texCoord[1]);
            cube.texCoordsArray.push(texCoord[3]);
            cube.texCoordsArray.push(texCoord[2]);
        }else{
            cube.texCoordsArray.push(0,0);
            cube.texCoordsArray.push(0,0);
            cube.texCoordsArray.push(0,0);
            cube.texCoordsArray.push(0,0);
            cube.texCoordsArray.push(0,0);
            cube.texCoordsArray.push(0,0);
        }
    }
    
    quad( 1, 0, 3, 2 ,texCoords[1]);
    quad( 2, 3, 7, 6 ,texCoords[3]);
    quad( 3, 0, 4, 7 ,texCoords[3]);
    quad( 6, 5, 1, 2 ,texCoords[3]);
    quad( 4, 5, 6, 7 ,texCoords[2]);
    quad( 5, 4, 0, 1 ,texCoords[3]);

    return cube;
}

function createObjects(){
    var sphere1 = createSphere([-2.7, 0, 0]);
    //sphere1.selfRotating = new Rotation([0,1,0], 1); // 自转

    var sphere2 = createSphere([2.7, 0, 0]);
    //sphere2.selfRotating = new Rotation([0,-1,0], 1); // 自转
    sphere2.material.ambient = vec3(0.0, 0.1, 0.14);
    sphere2.material.diffuse = vec3(0.0, 0.1, 0.14);

    var sphere3 = createSphere([0,2.7,0], 2);
    sphere3.selfRotating = new Rotation([0,1,0], 1); // 自转
    sphere3.material.ambient = vec3(0.2, 0.2, 0);
    sphere3.material.diffuse = vec3(0.2, 0.2, 0);

    var cubeMaterial = new Material();
    cubeMaterial.ambient = vec3(0.2,0.2,0.2);
    cubeMaterial.diffuse = vec3(0.5,0.5,0.5);
    cubeMaterial.specular = vec3(0.5,0.5,0.5);
    cubeMaterial.shininess = 60;
    var cube = createCube([0,0,0], cubeMaterial);
    cube.transform = mult(scalem(2.5,2.5,2.5),cube.transform);
    //cube.selfRotating = new Rotation([1,0,0], 1); // 自转

    transparent_objects.push(sphere1);
    transparent_objects.push(sphere2);
    opaque_objects.push(cube);
    opaque_objects.push(sphere3);
    greenBallCtr.obj = sphere3;
}

var greenBallCtr = {
    obj: null,
    currSubDivided:3,
    divideDislay: document.getElementById("subdivided-count"),
    angularSpeedDislay: document.getElementById("angular-speed"),
    applySubdivide: function (){
        var new_one = createSphere([0, 2.7, 0], this.currSubDivided);
        new_one.material = this.obj.material;
        new_one.selfRotating = this.obj.selfRotating;
        opaque_objects.splice(opaque_objects.indexOf(this.obj), 1);
        opaque_objects.push(new_one);
        this.divideDislay.textContent= this.currSubDivided;

    },
    decreaseSubdivide: function (){
        if(this.currSubDivided > 0){
            this.currSubDivided--;
            this.applySubdivide();
        }
    },
    increaseSubdivide: function (){
        if(this.currSubDivided < 6){
            this.currSubDivided++;
            this.applySubdivide();
        }
    },
    decreaseAngularSpeed: function(){
        this.obj.selfRotating.angularSpeed -= 0.4;
        this.angularSpeedDislay.textContent= this.obj.selfRotating.angularSpeed.toFixed(1);
    },
    increaseAngularSpeed: function(){
        this.obj.selfRotating.angularSpeed += 0.4;
        this.angularSpeedDislay.textContent= this.obj.selfRotating.angularSpeed.toFixed(1);
    },
    inverseAngularSpeed:function(){
        this.obj.selfRotating.angularSpeed = -this.obj.selfRotating.angularSpeed;
        this.angularSpeedDislay.textContent= this.obj.selfRotating.angularSpeed.toFixed(1);
    }
}


// 创建纹理对象，并设置参数，关联片元着色器中的采样器
function configureTexture( image ) {
	// 创建纹理对象texture并作为当前纹理对象，并装载了数字图像image
    var texture = gl.createTexture();//创建纹理对象
    gl.bindTexture( gl.TEXTURE_2D, texture );//绑定为当前2D纹理对象
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);//把纹理对象从顶端翻转到底部（因APP和纹理图像用不同坐标系）
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGB,gl.RGB, gl.UNSIGNED_BYTE, image );//将图像数组image指定为当前二维纹理，即存到纹理内存

    gl.generateMipmap( gl.TEXTURE_2D );	
	// TEXTURE_MIN_FILTER: 像素比纹素大，单个像素对应多个纹素，纹理需要缩小
	// NEAREST_MIPMAP_LINEAR: 采用点采样方式得到相邻的Mipmap纹理， 并且在得到的Mipmap纹理内部使用线性滤波
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR );	
	// gl.TEXTURE_MAG_FILTER：像素比纹素小，多个像素对应单个纹素，纹理需要放大
	// gl.NEAREST :点采样方式得相邻的纹理
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
	//关联当前纹理对象到片元SHADER中的采样器对象uTexture
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
}
var vBuffer;
var nBuffer;
var tBuffer;
//////////////////////////////////////////////////////////////////////////////////////////
window.onload = function init() {
    canvas = document.getElementById( "gl-canvas" );
    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    gl.viewport( 0, 0, canvas.width, canvas.height );
    // 背景颜色
    gl.clearColor( 0.93, 0.93, 0.93, 1.0 );
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); 
    gl.enable(gl.CULL_FACE);
    // 加载着色器
    program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );
    // attributes buffers
    vBuffer = gl.createBuffer();
    nBuffer = gl.createBuffer();
    tBuffer = gl.createBuffer();
    // 初始化uniform
    uniformLoc.objectTransformMatrix = gl.getUniformLocation( program, "uObjectTransformMatrix")
    uniformLoc.modelMatrix = gl.getUniformLocation( program, "uModelMatrix")
    uniformLoc.modelViewMatrix = gl.getUniformLocation( program, "uModelViewMatrix" );
    uniformLoc.projectionMatrix = gl.getUniformLocation( program, "uProjectionMatrix" );
    uniformLoc.ambientProduct = gl.getUniformLocation(program, "uAmbientProduct");
    uniformLoc.diffuseProduct = gl.getUniformLocation(program, "uDiffuseProduct");
    uniformLoc.specularProduct =  gl.getUniformLocation(program, "uSpecularProduct");
    uniformLoc.shininess = gl.getUniformLocation(program, "uShininess");
    uniformLoc.alpha = gl.getUniformLocation(program, "uAlpha");
    // 加载配置纹理
    var image = new Image();
    image.src = "texture.jpg"
	image.onload = function() {
        configureTexture( image );
    }  
    
    // 设置光源位置
    var lightR_input = $("#light-r");
    var lightTheta_input = $("#light-theta");
    var lightPhi_input = $("#light-phi");
    light.setPosByPolar(lightR_input.val(), lightTheta_input.val(), lightPhi_input.val());
    light.apply();
    // 设置相机
    camera.apply();
    // 创建模型数据
    createObjects();

    // 鼠标跟踪球
    function convertCoordinate(x,y){
        var bbox = canvas.getBoundingClientRect();
        return [2*(x-bbox.left)/bbox.width-1,2*(bbox.height-(y-bbox.top))/bbox.height-1];
    }

    $(canvas).bind('mousedown',function(event){
        var pos = convertCoordinate(event.pageX, event.pageY);
        traceball.mouseDown(pos[0],pos[1]);
    });

    $(canvas).bind('touchstart',function(event){
        event.preventDefault();
        var pos = convertCoordinate(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
        traceball.mouseDown(pos[0],pos[1]);
    });
    
    $(canvas).bind("mouseup mouseout", function(event){
        var pos = convertCoordinate(event.pageX, event.pageY);
        traceball.mouseLoss(pos[0],pos[1]);
    });

    $(canvas).bind('touchend touchcancel',function(event){
        event.preventDefault();
        var pos = convertCoordinate(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
        traceball.mouseLoss(pos[0],pos[1]);
    });

    $(canvas).bind("mousemove", function(event){
        var pos = convertCoordinate(event.pageX, event.pageY);
        traceball.mouseMotion(pos[0],pos[1]);
    });

    $(canvas).bind('touchmove',function(event){
        event.preventDefault();
        var pos = convertCoordinate(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
        traceball.mouseMotion(pos[0],pos[1]);
    });

    var projectionModeDisplay =  $("#projection-mode");
    $("#switch-projection-mode").bind("click",function(){
        camera.ortho =!camera.ortho;
        camera.apply();
        if(camera.ortho){
            projectionModeDisplay.text("正交");
        }else{
            projectionModeDisplay.text("透视");
        }
    });
    // 移动光照
    lightR_input.bind('input',(function(){
        light.setPosByPolar(lightR_input.val(), lightTheta_input.val(), lightPhi_input.val());
        light.apply();
    }));
    lightTheta_input.bind('input',(function(){
        light.setPosByPolar(lightR_input.val(), lightTheta_input.val(), lightPhi_input.val());
        light.apply();
    }));
    lightPhi_input.bind('input',(function(){
        light.setPosByPolar(lightR_input.val(), lightTheta_input.val(), lightPhi_input.val());
        light.apply();
    }));
    // 键盘平移相机
    document.onkeydown = function(event){
        var step = 0.02;
        switch (event.keyCode){
            // left
            case 37:case 65:
                camera.speed[0] = -step;
            break;
            // up
            case 38:case 87:
                camera.speed[2] = -step;
            break;
            // right
            case 39:case 68:
                camera.speed[0] = step;
            break;
            // down
            case 40:case 83:
                camera.speed[2] = step;
            break;
            default: return;
        }
    }
    document.onkeyup = function(event){
        camera.speed = [0,0,0];
    }
    // 绘制
    render();
}

function selfRotate(mat, angle, axis){
    var T = inverse4(mat);
    var R = rotate(angle, axis);
    return mult(mat,mult(R,mult(T,mat)));
}

function setObjectAtrributes(object){
    // 顶点 atrributes
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(object.pointsArray), gl.STATIC_DRAW);
    var aPosition = gl.getAttribLocation( program, "aPosition");
    gl.vertexAttribPointer(aPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    // 法向量 atrributes
    
    gl.bindBuffer( gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData( gl.ARRAY_BUFFER, flatten(object.normalsArray), gl.STATIC_DRAW );
    var aNormal = gl.getAttribLocation( program, "aNormal" );
    gl.vertexAttribPointer( aNormal, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( aNormal);

    // texture
   
    gl.bindBuffer( gl.ARRAY_BUFFER, tBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(object.texCoordsArray), gl.STATIC_DRAW );
    var aTexCoord = gl.getAttribLocation( program, "aTexCoord" );
    gl.vertexAttribPointer( aTexCoord, 2, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( aTexCoord );
}

function renderObject(object){
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
    gl.uniform3fv( uniformLoc.ambientProduct, flatten(ambientProduct));
    gl.uniform3fv( uniformLoc.diffuseProduct, flatten(diffuseProduct) );
    gl.uniform3fv( uniformLoc.specularProduct, flatten(specularProduct) );
    gl.uniform1f( uniformLoc.shininess, object.material.shininess );
    // 绘制
    gl.cullFace(gl.BACK); 
    gl.drawArrays( gl.TRIANGLES, 0, object.pointsArray.length);
    gl.cullFace(gl.FRONT);
    gl.drawArrays( gl.TRIANGLES, 0, object.pointsArray.length);
}

function render() { 
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 相机移动
    camera.moveBySpeed();
    camera.apply();
    // 跟踪球惯性移动
    traceball.rotateByInertia();
    // 应用场景变换矩阵
    scene.apply();
    // 绘制不透明对象
    gl.uniform1f( uniformLoc.alpha, 1 );
    for (const object of opaque_objects) {
        renderObject(object);
    }
    // 绘制透明对象
    gl.uniform1f( uniformLoc.alpha, 0.7 );
    gl.depthMask(false);
    for (const object of transparent_objects) {
        renderObject(object);
    }
    gl.depthMask(true);
    window.requestAnimFrame(render);
}