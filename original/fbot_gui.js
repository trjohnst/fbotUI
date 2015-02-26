/*  fbot_gui.js - Version 1.0 2015-01-04
    author of this modification:  Mark Johnston   mark-toys.com

    A simple HTML5/rosbridge script to control and monitor mark-toys fiddlerBot robot

    This started from simple_gui code as below:
    Created for the Pi Robot Project: http://www.pirobot.org
    Copyright (c) 2013 Patrick Goebel.  All rights reserved.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.5

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details at:

    http://www.gnu.org/licenses/gpl.html
 */

// Set the rosbridge and mjpeg_server port
var rosbridgePort = "9090";
var mjpegPort = "8080";

// Get the current hostname
// thisHostName = "raspberrypi";
thisHostName = document.location.hostname;

// Set the rosbridge and mjpeg server hostname accordingly
var rosbridgeHost = thisHostName;
var mjpegHost = thisHostName;

// Build the websocket URL to the rosbride server
var serverURL = "ws://" + rosbridgeHost + ":" + rosbridgePort;

// The mjpeg client object that will be defined later
var mjpegViewer;

// The default video topic (can be set in the rosbridge launch file)
// MJMOD var videoTopic = "/camera/rgb/image_color";
var videoTopic = "/camera/rgb/image_rgb";

var armGrab = false;
var armRaise = false;

// The mjpeg video quality (percent)
var videoQuality = 50;

// A varible to hold the chatter topic and publisher
var chatterTopic;

// A variable to hold the chatter message
var chatterMsg;

// The ROS namespace containing parameters for this script
var param_ns = '/robot_gui';

// Are we on a touch device?
var isTouchDevice = 'ontouchstart' in document.documentElement;

// A flag to indicate when the Shift key is being depressed
// The Shift key is used as a "dead man's switch" when using the mouse
// to control the motion of the robot.
var shiftKey = false;

// The topic on which to publish Twist messages
var cmdVelTopic = '/rf_api';
var collisionInfoTopic = '/collision_detect';

// Default linear and angular speed
var defaultLinearSpeed  = 6.0;
var defaultAngularSpeed = 1.0;

// Current maximum linear and angular speeds (can be overriden in rosbridge.launch)
var maxLinearSpeed  = defaultLinearSpeed;
var maxAngularSpeed =  4.0;

// Minimum linear and angular speed
var minLinearSpeed  = 2.0;
var minAngularSpeed = 2.0;

// How much to increment speeds with each key press
var vx_click_increment = 1.0;
var vz_click_increment = 1.0;

// Current desired linear and angular speed
var vx = 0.0;
var vz = 0.0;

// Current camera Pan value
var panAngle = 40.0;
var cameraPanServo = 0.0;
var panAngle_click_increment = 5.0;
var panAngle_minimum = 0.0;
var panAngle_maximum = 80.0;

// A handle for the publisher timer
var pubHandle = null;

// A handle for the stop timer
var stopHandle = null;

// The rate in Hz for the main ROS publisher loop
var rate = 5;

// Get the current window width and height
var windowWidth = this.window.innerWidth;
var windowHeight = this.window.innerHeight;

// Set the video width to 1/2 of the window width and scale the height
// appropriately.
var videoWidth = Math.round(windowWidth / 2.0);
var videoHeight = Math.round(videoWidth * 240 / 320);

//The main ROS object
var ros = new ROSLIB.Ros();

// Connect to ROS
function init_ros() {
        ros.connect(serverURL);

        // Set the rosbridge host and port values in the form
        document.getElementById("rosbridgeHost").value = rosbridgeHost;
        document.getElementById("rosbridgePort").value = rosbridgePort;
}

// Connect to ROS
function init_ros() {
        console.log("init_ros() starting.");
        ros.connect(serverURL);

        // Set the rosbridge host and port values in the form
        document.getElementById("rosbridgeHost").value = rosbridgeHost;
        document.getElementById("rosbridgePort").value = rosbridgePort;
        console.log("init_ros() done.");

        try {
            // console.log("do_ros_on() will be run.");
            // MJ: If I add this I get farther BUT we really NEED the ros.on callback!!!
            // do_ros_on();
            // console.log("do_ros_on() has run.");
        } catch (error) {
            console.log("do_ros_on() had an exception.");
            console.write(error);
        }
}

// If there is an error on the back end, an 'error' emit will be emitted.
ros.on('error', function(error) {
        console.log("Rosbridge Error: " + error);
});

// Wait until a connection is made before continuing
ros.on('connection', function() {
        console.log('Rosbridge connected.');

        // Create a Param object for the video topic
        var videoTopicParam = new ROSLIB.Param({
                ros : ros,
                name : param_ns + '/videoTopic'
        });

        videoTopicParam.get(function(value) {
            if (value != null) {
                videoTopic = value;
            }

            // Create the video viewer
            if (!mjpegViewer) {
                mjpegViewer = new MJPEGCANVAS.Viewer({
                    divID : 'videoCanvas',
                    host : mjpegHost,
                    port : mjpegPort,
                    width : videoWidth,
                    height : videoHeight,
                    quality : videoQuality,
                    topic : videoTopic
                });
            }
        });

        // Create a Param object for the max linear speed
        var maxLinearSpeedParam = new ROSLIB.Param({
                ros : ros,
                name : param_ns + '/maxLinearSpeed'
        });


        // Create a Param object for the max angular speed
        var maxAngularSpeedParam = new ROSLIB.Param({
                ros : ros,
                name : param_ns + '/maxAngularSpeed'
        });

        // Create the chatter topic and publisher
        chatterTopic = new ROSLIB.Topic({
                ros : ros,
                name : '/chatter',
                messageType : 'std_msgs/String',
        });

        // Create the chatter message
        var message = document.getElementById('chatterMessage');
        chatterMsg = new ROSLIB.Message({
                data : message.value
        });

        document.addEventListener('keydown', function(e) {
                if (e.shiftKey)
                        shiftKey = true;
                else
                        shiftKey = false;
                setSpeed(e.keyCode);
        }, true);

        document.addEventListener('keydown', function(e) {
                if (e.shiftKey)
                        shiftKey = true;
                else
                        shiftKey = false;
                setCamPan(e.keyCode);
        }, true);

        document.addEventListener('keyup', function(e) {
                if (!e.shiftKey) {
                        shiftKey = false;
                        stopRobot();
                }
        }, true);

         // Display a line of instructions on how to move the robot
        if (isTouchDevice) {
                // Set the Nav instructions appropriately for touch
                var navLabel = document.getElementById("navInstructions");
                navLabel.innerHTML = "Tap an arrow to move the robot";

                // Hide the publish/subscribe rows on touch devices
                var pubSubBlock = document.getElementById("pubSubBlock");
                pubSubBlock.style.visibility = 'hidden';
        }
        else {
                // Set the Nav instructions appropriately for mousing
                var navLabel = document.getElementById("navInstructions");
                navLabel.innerHTML = "Hold down SHIFT Key when clicking arrows";
        }

        // Start the publisher loop
        console.log("Starting publishers");
        pubHandle = setInterval(refreshPublishers, 1000 / rate);
});



function toggleChatter() {
        var pubChatterOn = document.getElementById('chatterToggle').checked;
        if (pubChatterOn) chatterTopic.advertise();
        else chatterTopic.unadvertise();
}

function updateChatterMsg(msg) {
        chatterMsg.data = msg;
}

function refreshPublishers() {
        // Keep the /cmd_vel messages alive
        // pubCmdVel();

        if (chatterTopic.isAdvertised)
                chatterTopic.publish(chatterMsg);
}

var cmdVelPub = new ROSLIB.Topic({
        ros : ros,
        name : '/rf_api',
        messageType : 'pi_bot1/MainApi'
});

var cmdArmControlPub = new ROSLIB.Topic({
        ros : ros,
        name : '/arm_control',
        messageType : 'pi_bot1/ArmControl'
});

// Publish the speed now
// vx is forward speed and vz is differential speed
function pubCmdVel() {
        console.log("pubCmdVel: vx = " + vx + " vz = " + vz);

        console.log("pubCmdVel: After limit checks vx = " + vx + " vz = " + vz);

        // Individual speeds for right and left wheel
        var vrw = vx;
        var vlw = vx;
        if (vz > 0) {
            vrw += vz;
            // vrw = Math.min(Math.abs(vrw), maxLinearSpeed) ;
        }
        if (vz < 0) {
            vlw -= vz;
            // vlw = Math.min(Math.abs(vlw), maxLinearSpeed) ;
        }
        console.log("pubCmdVel: Wheel speeds are vrw = " + vrw + " vlw = " + vlw);

        //if (isNaN(vx) || isNaN(vz)) {
        //        vx = 0;
        //        vz = 0;
        //}

        var cmdStr = 'FORWARD';
        if (vrw > vlw) {
            cmdStr = 'LEFT';
        } else if (vrw < vlw) {
            cmdStr = 'RIGHT';
        }
        if ((vrw == 0) && (vlw == 0)) {
            cmdStr = 'STOP';
        }

        var cmdVelMsg = new ROSLIB.Message({
                        commandName : cmdStr,
                        commandArgs : '',
                        param1  : Math.round(vrw),
                        param2  : Math.round(vlw),
                        param3  : 0,
                        param4  : 0,
                        str1 : '',
                        str2 : '',
                        comment : "Move command"
        });

        var statusMessage = "vrw: " + Math.round(vrw) + " vlw: " + Math.round(vlw);
        writeStatusMessage('cmdVelStatusMessage', statusMessage);

        console.log('publish to /rf_api');
        cmdVelPub.publish(cmdVelMsg);
}




// Publish the grabber arm state
// The arm is controlled with one parameter as follows
// 0 = open and down, 2=grab but not raised, 3=grab and raise low, 4=grab and raise hight
//
function pubArmControl(armRaise, armGrab) {
        console.log("pubArmControl: armRaise = " + armRaise + " armGrab = " + armGrab);
        var armState = 0;
        var thisComment = 'Set grabber arm';

        if (!armRaise && !armGrab) {
          armState = 0;
          thisComment = 'Release grabber arm';
        } else 
        if (!armRaise && armGrab) {
          armState = 2;
          thisComment = 'just grab with grabber arm';
        } else 
        if (armRaise && !armGrab) {
          armState = 3;
          thisComment = 'grab and raise low the grabber arm';
        } else 
        if (armRaise && armGrab) {
          armState = 4;
          thisComment = 'grab and raise high the grabber arm';
        }
       
        var cmdArmControlMsg = new ROSLIB.Message({
                        actionType : armState,
                        armNumber  : 1,
                        value      : 0,
                        comment    : thisComment
        });

        console.log('publish to /arm_control');
        cmdArmControlPub.publish(cmdArmControlMsg);
}

// When the 'grab' checkbox is changed we get to here
function subArmGrab()  {
    armGrab = document.getElementById('armGrabSub').checked;
    pubArmControl(armRaise, armGrab);
}

// When the 'raise' checkbox is changed we get to here
function subArmRaise()  {
    armRaise = document.getElementById('armRaiseSub').checked;
    pubArmControl(armRaise, armGrab);
}


// Publish the camera pan info with direct servo control (yes, a little bit dirty just now)
// The camera Pan accepts 0 through 120
//
function pubCmdPan() {
        console.log("pubPanControl: pan value = " + panAngle );
        var panSetting = panAngle;

        
        if (panSetting > panAngle_maximum) {
          panSetting = panAngle_maximum;
        } else
        if (panSetting < panAngle_minimum) {
          panSetting = panAngle_minimum;
        }
        var thisComment = 'Set camera pan angle to ' + panAngle;

        // Send to arm 2 for pan servo and use direct 0-127 position command
        var cmdPanControlMsg = new ROSLIB.Message({
                        actionType : 6,
                        armNumber  : 2,
                        value      : panSetting,
                        comment    : thisComment
        });

        console.log('publish to /arm_control');
        cmdArmControlPub.publish(cmdPanControlMsg);
}


// Speed control using the arrow keys or icons
function setSpeed(code) {
        console.log("setSpeed:  code of " + code);

        // Stop if the deadman key (Shift) is not depressed
        //if (!shiftKey && !isTouchDevice) {
        //        stopRobot();
        //        return;
        //}

        var setVelNow = false;

        // Use space bar as an emergency stop
        if (code == "stop" || code == 32) {
            console.log("setSpeed:  STOP");
            vx = 0;
            vz = 0;
            setVelNow = true;
        }
        // Left arrow
        else if (code == "left" || code == 37) {
            vz += vz_click_increment;
            console.log("setSpeed:  left with new vz = " + vz);
            setVelNow = true;
        }
        // Up arrow
        else if (code == 'forward' || code == 38) {
            vx += vx_click_increment;
            console.log("setSpeed: forward with new vx = " + vx);
            setVelNow = true;
        }
        // Right arrow
        else if (code == 'right' || code == 39) {
            console.log("setSpeed: right with new vz = " + vz);
            vz -= vz_click_increment;
            setVelNow = true;
        }
        // Down arrow
        else if (code == 'backward' || code == 40) {
            vx -= vx_click_increment;
            console.log("setSpeed: backward with new vx = " + vx);
            setVelNow = true;
        }

        if (setVelNow) {
            pubCmdVel();
        }
}

function stopRobot() {
        vx = vz = 0;
        var statusMessage = "vx: " + vx.toFixed(2) + " vz: " + vz.toFixed(2);
        writeStatusMessage('cmdVelStatusMessage', statusMessage);
        pubCmdVel();
}


// Camera Pan control using the arrow keys or icons
function setCamPan(code) {
        console.log("setSpeed:  code of " + code);

        var setPanNow = false;

        // Use space bar as an emergency stop
        if (code == "stop" || code == 32) {
            console.log("setCamPan:  STOP");
            setPanNow = true;
        }
        // Left arrow
        else if (code == "left" || code == 37) {
            panAngle += panAngle_click_increment;
            console.log("setCamPan:  left with new panAngle = " + panAngle);
            setPanNow = true;
        }
        // Right arrow
        else if (code == 'right' || code == 39) {
            console.log("setCamPan: right with new panAngle = " + panAngle);
            panAngle -= panAngle_click_increment;
            setPanNow = true;
        }
        if (panAngle > panAngle_maximum) {
          panAngle = panAngle_maximum;
        } else
        if (panAngle < panAngle_minimum) {
          panAngle = panAngle_minimum;
        }

        if (setPanNow) {
            pubCmdPan();
        }
}


function timedStopRobot() {
    stopHandle = setTimeout(function() { stopRobot() }, 1000);
}

function clearTimedStop() {
        clearTimeout(stopHandle);
}


function subNavigationInfo() {
        var subscribe = document.getElementById('navigationSub').checked;
        var navigationData = document.getElementById('navigationData');
        var navigationInfo = new ROSLIB.Topic({
            ros : ros,
            name : '/navigation_basic',
            messageType : 'pi_bot1/NavigationBasicInfo'
        });
 
        if (subscribe) {
            // Subscribe to the topic with topic name below and msg file name of messageType
            console.log('Subscribed to ' + navigationInfo.name);
            navigationInfo.subscribe(function(msg) {
                navigationData.value = "Tilt: X:" + msg.yAcceleration + "Y:" + msg.zAcceleration + 
                                "      Mag: X:" + msg.yMagnetic + " Y:" + msg.zMagnetic;
            });
        } else {
            navigationInfo.unsubscribe();
            console.log('UnSubscribed from ' + navigationInfo.name);
            navigationData.value = "unknown"
        }
}


function subHardwareMonitorInfo() {
        var subscribe = document.getElementById('hardwareMonitorSub').checked;
        var hardwareMonitorData = document.getElementById('hardwareMonitorData');
        var hardwareMonitorInfo = new ROSLIB.Topic({
            ros : ros,
            name : '/hardware_monitor',
            messageType : 'pi_bot1/HardwareMonitorInfo'
        });
        if (subscribe) {
            // Subscribe to the topic with topic name below and msg file name of messageType
            console.log('Subscribed to ' + hardwareMonitorInfo.name);
            hardwareMonitorInfo.subscribe(function(msg) {
                var batteryVoltage = parseFloat(msg.batteryVoltage);
                var airTemperature = parseFloat(msg.airTemperature);
                hardwareMonitorData.value = "Bat: " + batteryVoltage.toFixed(2) + " V" + 
                                          "  Temp: " + airTemperature.toFixed(1) + " F";
            });
        } else {
            hardwareMonitorInfo.unsubscribe();
            console.log('UnSubscribed from ' + hardwareMonitorInfo.name);
            hardwareMonitorData.value = "unknown"
        }
}


function subCollisionInfo() {
        var subscribe = document.getElementById('collisionSub').checked;
        var collisionData = document.getElementById('collisionData');
        var collisionInfo = new ROSLIB.Topic({
            ros : ros,
            name : '/collision_detect',
            messageType : 'pi_bot1/CollisionInfo'
        });
 
        if (subscribe) {
            // Subscribe to the topic with topic name below and msg file name of messageType
            console.log('Subscribed to ' + collisionInfo.name);
            collisionInfo.subscribe(function(msg) {
                var mask = 0x2;
                var bits = parseInt(msg.collisionBits);
                var rightHit = ((bits & mask) > 0) ? 'HIT  ' : 'clear';
                var mask = 0x1;
                var leftHit  = ((bits & mask) > 0) ? 'HIT  ' : 'clear';
                collisionData.value = "Left: " + leftHit + "  Right: " + rightHit ;
            });
        } else {
            collisionInfo.unsubscribe();
            console.log('UnSubscribed from ' + collisionInfo.name);
            collisionData.value = "unknown"
        }
}


function subChatter() {
        var subscribe = document.getElementById('chatterSub').checked;
        var chatterData = document.getElementById('chatterData');
        var listener = chatterTopic;

        if (subscribe) {
                console.log('Subscribed to ' + listener.name);
                listener.subscribe(function(msg) {
                        chatterData.value = msg.data;
                });
        } else {
                listener.unsubscribe();
                console.log('Unsubscribed from ' + listener.name);
        }
}

function setROSParam() {
        var paramName = document.getElementById('setParamName');
        var paramValue = document.getElementById('setParamValue');
        var param = new ROSLIB.Param({
                ros : ros,
                name : param_ns + '/' + paramName.value
        });
        param.set(parseFloat(paramValue.value));
}

function getROSParam() {
        var paramName = document.getElementById('getParamName');
        var paramValue = document.getElementById('getParamValue');
        var param = new ROSLIB.Param({
                ros : ros,
                name : param_ns + '/' + paramName.value
        });
        var prt1 = "Get of param " + param_ns + '/' + paramName.value;
        console.log(prt1);
        param.get(function(value) {
                paramValue.value = value;
                console.log("got param of " + value);
        });
}

function setMaxLinearSpeed(speed) {
        maxLinearSpeed = speed;
        console.log("Max linear speed set to: " + maxLinearSpeed);
}

function getMaxLinearSpeed() {
        return maxLinearSpeed;
}

function setMaxAngularSpeed(speed) {
        maxAngularSpeed = speed;
        console.log("Max angular speed set to: " + maxAngularSpeed);
}

function connectDisconnect() {
        var connect = document.getElementById('connectROS').checked;

        if (connect)
                connectServer();
        else
                disconnectServer();
}

function disconnectServer() {
        console.log("Disconnecting from ROS.");
        // MJ: mjpegViewer.changeStream();
        ros.close();
}

function connectServer() {
        rosbridgeHost = document.getElementById("rosbridgeHost").value;
        rosbridgePort = document.getElementById("rosbridgePort").value;
        serverURL = "ws://" + rosbridgeHost + ":" + rosbridgePort;
        // MJ: mjpegViewer.changeStream(videoTopic);
        console.log("Connect to ROS using server : " + serverURL);
        try {
                ros.connect(serverURL);
                console.log("Connected to ROS.");
        } catch (error) {
                console.write(error);
        }
}

function writeStatusMessage(field, message, color) {
        color = typeof color !== 'undefined' ? color : "#006600";
        element = document.getElementById(field);
        element.innerHTML = message;
        element.style.font = "18pt Calibri";
        element.style.color = color;
}

function sign(x) {
        if (x < 0) {
                return -1;
        }
        if (x > 0) {
                return 1;
        }
        return 0;
}

