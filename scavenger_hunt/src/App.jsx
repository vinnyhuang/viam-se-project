import { useEffect, useRef, useState } from 'react'
import * as VIAM from '@viamrobotics/sdk'
import { CameraClient, VisionClient,  createViamClient } from '@viamrobotics/sdk'
import './App.css'
import householdObjectsText from './data/household_objects.txt?raw'
import customObjectsText from './data/scavenger_custom_objects.txt?raw'

// Parse the text files into arrays of objects and combine them
const HOUSEHOLD_OBJECTS = householdObjectsText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)

const CUSTOM_OBJECTS = customObjectsText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)

// Combine and sort all objects alphabetically
const ALL_OBJECTS = [...HOUSEHOLD_OBJECTS, ...CUSTOM_OBJECTS]
  .sort((a, b) => a.localeCompare(b))

function App() {
  const [error, setError] = useState(null)
  const [currentObject, setCurrentObject] = useState(null)
  const [score, setScore] = useState(0)
  const [totalObjectsFound, setTotalObjectsFound] = useState(0)
  const [isGameActive, setIsGameActive] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [skipCount, setSkipCount] = useState(0)
  const [isChecking, setIsChecking] = useState(false)
  const [activeTab, setActiveTab] = useState('game')
  const [showObjectSelector, setShowObjectSelector] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDetections, setShowDetections] = useState(false)
  const [currentDetections, setCurrentDetections] = useState([])
  const [gallery, setGallery] = useState([])
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const animationFrameId = useRef(null)
  const machineRef = useRef(null)
  const cameraRef = useRef(null)
  const streamRef = useRef(null)
  const visionRef = useRef(null)
  const customVisionRef = useRef(null)
  const isStreamingRef = useRef(false)
  const detectionIntervalRef = useRef(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const timerRef = useRef(null)

  // Function to select a random object from the list
  const selectRandomObject = () => {
    const randomIndex = Math.floor(Math.random() * ALL_OBJECTS.length)
    const newObject = ALL_OBJECTS[randomIndex]
    console.log('Selected new object:', newObject)
    setCurrentObject(newObject)
    return newObject
  }

  // Function to manually select an object
  const handleObjectSelect = (object) => {
    console.log('Manually selected object:', object)
    setCurrentObject(object)
  }

  // Function to check if an object is from the custom list
  const isCustomObject = (object) => {
    return CUSTOM_OBJECTS.includes(object)
  }

  // Filter objects based on search query
  const filteredObjects = ALL_OBJECTS.filter(object =>
    object.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const drawDetections = () => {
    if (!canvasRef.current || !videoRef.current || !showDetections) {
      console.log('Cannot draw detections:', {
        hasCanvas: !!canvasRef.current,
        hasVideo: !!videoRef.current,
        showDetections
      })
      // Clear canvas if we can't draw
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')

    // Get the actual displayed dimensions of the video
    const videoRect = video.getBoundingClientRect()
    const videoWidth = videoRect.width
    const videoHeight = videoRect.height

    // Set canvas dimensions to match the displayed video size
    canvas.width = videoWidth
    canvas.height = videoHeight

    console.log('Video and Canvas dimensions:', {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      displayWidth: videoWidth,
      displayHeight: videoHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    })

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    console.log('Drawing detections:', currentDetections)

    // Draw each detection
    currentDetections.forEach(detection => {
      const { xMin, yMin, xMax, yMax, className, confidence, detector } = detection
      console.log('Processing detection:', { className, confidence, xMin, yMin, xMax, yMax, detector })
      
      // Calculate scaling factors
      const scaleX = videoWidth / video.videoWidth
      const scaleY = videoHeight / video.videoHeight
      
      // Apply scaling to coordinates
      const x1 = Number(xMin) * scaleX
      const y1 = Number(yMin) * scaleY
      const x2 = Number(xMax) * scaleX
      const y2 = Number(yMax) * scaleY

      console.log('Scaled coordinates:', { x1, y1, x2, y2, scaleX, scaleY })

      // Draw bounding box
      ctx.strokeStyle = detector === 'custom' ? '#F56565' : '#38B2AC'
      ctx.lineWidth = 2
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

      // Draw label background
      const text = `${className} (${(Number(confidence) * 100).toFixed(1)}%)`
      const textWidth = ctx.measureText(text).width
      ctx.fillStyle = detector === 'custom' ? 'rgba(245, 101, 101, 0.8)' : 'rgba(56, 178, 172, 0.8)'
      ctx.fillRect(x1, y1 - 20, textWidth + 10, 20)

      // Draw label text
      ctx.fillStyle = 'white'
      ctx.font = '12px Montserrat'
      ctx.fillText(text, x1 + 5, y1 - 5)
    })
  }

  const getDetections = async () => {
    try {
      console.log('Fetching detections...')
      const [householdDetections, customDetections] = await Promise.all([
        visionRef.current.getDetectionsFromCamera("cam"),
        customVisionRef.current.getDetectionsFromCamera("cam")
      ])
      
      console.log('Raw household detections:', householdDetections)
      console.log('Raw custom detections:', customDetections)
      
      const filteredHouseholdDetections = householdDetections
        .filter(d => d.confidence > 0.3)
        .map(d => ({ ...d, detector: 'household' }))
      
      const filteredCustomDetections = customDetections
        .filter(d => d.confidence > 0.3)
        .map(d => ({ ...d, detector: 'custom' }))
      
      const allDetections = [...filteredHouseholdDetections, ...filteredCustomDetections]
      console.log('Combined filtered detections:', allDetections)
      
      setCurrentDetections(allDetections)
      if (showDetections) {
        drawDetections()
      }
    } catch (error) {
      console.error('Error getting detections:', error)
    }
  }

  useEffect(() => {
    console.log('Setting up detection interval, showDetections:', showDetections)
    // Start detection interval
    detectionIntervalRef.current = setInterval(getDetections, 2000)

    return () => {
      console.log('Cleaning up detection interval')
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
    }
  }, [showDetections])

  useEffect(() => {
    console.log('Detections or showDetections changed:', {
      showDetections,
      currentDetections
    })
    if (showDetections) {
      drawDetections()
    } else {
      // Clear canvas when detections are hidden
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [showDetections, currentDetections])

  useEffect(() => {
    const main = async () => {
      const host = import.meta.env.VITE_VIAM_ADDRESS
      console.log('Initializing connection to host:', host)

      try {
        const machine = await VIAM.createRobotClient({
          host,
          credentials: {
            type: "api-key",
            payload: import.meta.env.VITE_VIAM_API_KEY,
            authEntity: import.meta.env.VITE_VIAM_API_KEY_ID,
          },
          signalingAddress: "https://app.viam.com:443",
        })
        console.log('Successfully connected to robot client')
        machineRef.current = machine

        // Get the camera, stream, and vision clients
        cameraRef.current = new CameraClient(machine, "cam")
        streamRef.current = new VIAM.StreamClient(machine)
        visionRef.current = new VisionClient(machine, "myPeopleDetector")
        customVisionRef.current = new VisionClient(machine, "scavengerCustomDetector")
        console.log('Initialized all clients')

        // Start the camera stream
        startStream()

        // Select the first object
        selectRandomObject()

      } catch (error) {
        console.error("Error in main setup:", error)
        setError(error instanceof Error ? error.message : "Failed to get data")
      }
    }

    main()

    // Cleanup on component unmount
    return () => {
      stopStream()
      if (machineRef.current) {
        machineRef.current.disconnect()
      }
    }
  }, [])

  const updateCameraStream = async () => {
    if (!isStreamingRef.current) {
      console.log('Streaming is not active')
      return
    }

    try {
      if (!videoRef.current) {
        console.error('Video element reference is not available')
        return
      }

      console.log('Attempting to get stream')
      const mediaStream = await streamRef.current.getStream("cam")
      console.log('Got media stream:', mediaStream)

      if (!mediaStream) {
        console.error('No media stream received')
        return
      }

      videoRef.current.srcObject = mediaStream
      console.log('Set video source object')

      try {
        await videoRef.current.play()
        console.log('Successfully started playing video')
      } catch (playError) {
        console.error("Error playing video:", playError)
      }

      animationFrameId.current = requestAnimationFrame(() => updateCameraStream())
    } catch (error) {
      console.error("Stream error:", error)
      stopStream()
    }
  }

  const startStream = () => {
    console.log('Starting stream')
    isStreamingRef.current = true
    updateCameraStream()
  }

  const stopStream = () => {
    console.log('Stopping stream')
    isStreamingRef.current = false
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current)
    }
  }

  // Function to start a new game
  const startNewGame = () => {
    setIsGameActive(true)
    setScore(0)
    setSkipCount(0)
    setTimeRemaining(5 * 60) // 5 minutes in seconds
    selectRandomObject()
  }

  // Function to end the current game
  const endGame = () => {
    setIsGameActive(false)
    setTimeRemaining(0)
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
  }

  // Function to handle skip
  const handleSkip = () => {
    if (isGameActive) {
      setSkipCount(prev => prev + 1)
    }
    selectRandomObject()
  }

  // Timer effect
  useEffect(() => {
    if (isGameActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            endGame()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isGameActive, timeRemaining])

  // Format time remaining as MM:SS
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const checkForObject = async () => {
    if (isChecking) {
      console.log('Already checking for object')
      return
    }

    setIsChecking(true)
    console.log('Checking for object:', currentObject)

    try {
      console.log('Getting detections from camera...')
      const [householdDetections, customDetections] = await Promise.all([
        visionRef.current.getDetectionsFromCamera("cam"),
        customVisionRef.current.getDetectionsFromCamera("cam")
      ])
      console.log('Got household detections:', householdDetections)
      console.log('Got custom detections:', customDetections)

      // Use the appropriate detector based on the object type
      const detections = isCustomObject(currentObject) ? customDetections : householdDetections
      console.log('Using detections from:', isCustomObject(currentObject) ? 'custom detector' : 'household detector')

      let found = false
      let matchingDetection = null
      for (const detection of detections) {
        console.log(`Found ${detection.className} with confidence ${detection.confidence}`)
        if (detection.confidence > 0.3 && 
            detection.className.toLowerCase() === currentObject.toLowerCase()) {
          console.log('Found matching object!')
          found = true
          matchingDetection = detection
          break
        }
      }

      if (found) {
        console.log('Object found! Updating score and selecting new object')
        setTotalObjectsFound(prev => prev + 1)
        if (isGameActive) {
          setScore(prev => prev + 1)
        }
        
        // Capture the current frame
        const canvas = document.createElement('canvas')
        const video = videoRef.current
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0)
        const imageData = canvas.toDataURL('image/jpeg')
        
        // Add to gallery
        setGallery(prevGallery => [{
          image: imageData,
          object: currentObject,
          detection: matchingDetection,
          timestamp: new Date().toISOString()
        }, ...prevGallery])

        selectRandomObject()
      } else {
        console.log('Object not found')
      }

    } catch (error) {
      console.error('Error checking for object:', error)
      setError(error instanceof Error ? error.message : "Failed to check for object")
    } finally {
      setIsChecking(false)
    }
  }

  const captureTrainingImage = async () => {
    if (isCapturing) return
    setIsCapturing(true)

    try {
      // Create Viam client
      const client = await createViamClient({
        host: import.meta.env.VITE_VIAM_ADDRESS,
        credentials: {
          type: 'api-key',
          payload: import.meta.env.VITE_VIAM_API_KEY,
          authEntity: import.meta.env.VITE_VIAM_API_KEY_ID
        },
        signalingAddress: "https://app.viam.com:443"
      })

      // Get image from camera
      const image = await cameraRef.current.getImage()
      
      console.log('client', client)
      
      // Convert the image data to a format that can be displayed
      const binaryData = image.data
      
      // Upload the image using binaryDataCaptureUpload
      const now = new Date()
      await client.dataClient.binaryDataCaptureUpload(
        binaryData,
        'a72eb844-b833-4a3f-991c-1629a82d434d',
        'rdk:component:camera',
        'cam',
        'ReadImage',
        '.png',
        [now, now]
      )

      console.log('Successfully uploaded training image')
      alert('Training image captured and uploaded successfully!')
    } catch (error) {
      console.error('Error capturing training image:', error)
      alert('Failed to capture training image. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#FAF9F7',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Montserrat, sans-serif',
    }}>
      {/* Main content */}
      <div style={{ 
        width: '100%',
        maxWidth: '1200px',
        padding: '40px',
        display: 'flex',
        gap: '30px',
      }}>
        {/* Main content area - 70% width */}
        <div style={{ 
          flex: '0 0 70%',
        }}>
          <div id="main" style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E2E8F0',
          }}>
            {/* Header */}
            <div style={{
              backgroundColor: '#38B2AC',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '30px',
            }}>
              <h1 style={{ 
                fontSize: '32px',
                fontFamily: 'Quicksand, sans-serif',
                fontWeight: '600',
                color: 'white',
              }}>Scavenger Hunt</h1>
            </div>

            {/* Tabs */}
            <div style={{ 
              display: 'flex', 
              marginBottom: '30px',
              backgroundColor: '#2C7A7B',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setActiveTab('game')}
                style={{
                  flex: 1,
                  padding: '15px 24px',
                  backgroundColor: activeTab === 'game' ? '#38B2AC' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  ':hover': {
                    backgroundColor: '#38B2AC',
                  },
                }}
              >
                Game
              </button>
              <button
                onClick={() => setActiveTab('training')}
                style={{
                  flex: 1,
                  padding: '15px 24px',
                  backgroundColor: activeTab === 'training' ? '#38B2AC' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  ':hover': {
                    backgroundColor: '#38B2AC',
                  },
                }}
              >
                Training
              </button>
            </div>

            {/* Camera Feed */}
            <div style={{ 
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              <h2 style={{ 
                fontSize: '20px',
                color: '#2C7A7B',
                marginBottom: '15px',
                fontFamily: 'Quicksand, sans-serif',
                fontWeight: '600',
              }}>Camera Feed</h2>
              <p style={{ 
                color: '#4A5568',
                marginBottom: '15px',
                fontFamily: 'Montserrat, sans-serif',
              }}>Show the object in front of the camera:</p>
            </div>
            <div id="insert-stream" style={{ 
              marginBottom: '30px',
              display: 'flex',
              justifyContent: 'center',
              position: 'relative',
            }}>
              {error ? (
                <p style={{ color: '#F56565' }}>Error: {error}</p>
              ) : (
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #E2E8F0',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}>
                    <span style={{
                      fontSize: '14px',
                      color: '#4A5568',
                      fontFamily: 'Montserrat, sans-serif',
                    }}>
                      Show Detections
                    </span>
                    <div
                      onClick={() => {
                        setShowDetections(!showDetections)
                        if (!showDetections) {
                          const canvas = canvasRef.current
                          const ctx = canvas?.getContext('2d')
                          if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height)
                          }
                        }
                      }}
                      style={{
                        width: '40px',
                        height: '20px',
                        backgroundColor: showDetections ? '#38B2AC' : '#E2E8F0',
                        borderRadius: '10px',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        width: '16px',
                        height: '16px',
                        borderRadius: '8px',
                        backgroundColor: 'white',
                        top: '2px',
                        left: showDetections ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                      }} />
                    </div>
                  </div>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ 
                      background: 'black', 
                      borderRadius: '8px', 
                      width: '100%', 
                      maxWidth: '800px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    style={{
                      position: 'absolute',
                      top: '20px',
                      left: '20px',
                      width: 'calc(100% - 40px)',
                      maxWidth: '800px',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ 
              textAlign: 'center',
              marginBottom: '30px',
            }}>
              <button 
                onClick={checkForObject}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#38B2AC',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  ':hover': {
                    backgroundColor: '#2C7A7B',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                  },
                }}
              >
                Submit
              </button>
            </div>

            {activeTab === 'game' && (
              <>
                <div style={{ 
                  marginBottom: '30px',
                  padding: '20px',
                  backgroundColor: '#F7FAFC',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ 
                      fontSize: '20px',
                      color: '#2C7A7B',
                      marginBottom: '15px',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: '600',
                    }}>Current Object to Find:</h2>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '15px',
                      marginBottom: '15px',
                    }}>
                      <p style={{ 
                        fontSize: '28px', 
                        fontWeight: '600',
                        color: '#2C7A7B',
                        fontFamily: 'Quicksand, sans-serif',
                      }}>{currentObject}</p>
                      <button
                        onClick={handleSkip}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#F56565',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: '500',
                          transition: 'all 0.2s ease',
                          ':hover': {
                            backgroundColor: '#E53E3E',
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        Skip
                      </button>
                    </div>
                    <button
                      onClick={() => setShowObjectSelector(!showObjectSelector)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#38B2AC',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: '500',
                        transition: 'all 0.2s ease',
                        marginBottom: '15px',
                        ':hover': {
                          backgroundColor: '#2C7A7B',
                          transform: 'translateY(-1px)',
                        },
                      }}
                    >
                      {showObjectSelector ? 'Hide' : 'Show'} Manual Selection
                    </button>

                    {showObjectSelector && (
                      <div style={{ 
                        padding: '15px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                      }}>
                        <div style={{ 
                          marginBottom: '15px',
                          width: '100%',
                        }}>
                          <input
                            type="text"
                            placeholder="Search objects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '14px',
                              fontFamily: 'Montserrat, sans-serif',
                              backgroundColor: '#F7FAFC',
                              boxSizing: 'border-box',
                              ':focus': {
                                outline: 'none',
                                borderColor: '#38B2AC',
                                boxShadow: '0 0 0 2px rgba(56, 178, 172, 0.2)',
                              },
                            }}
                          />
                        </div>
                        <div style={{ 
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                          gap: '10px',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '10px',
                        }}>
                          {filteredObjects.map((object) => (
                            <div
                              key={object}
                              onClick={() => handleObjectSelect(object)}
                              style={{
                                padding: '10px',
                                backgroundColor: object === currentObject ? '#38B2AC' : 'white',
                                color: object === currentObject ? 'white' : '#2C7A7B',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                fontSize: '14px',
                                fontFamily: 'Montserrat, sans-serif',
                                fontWeight: '500',
                                border: '1px solid #E2E8F0',
                                transition: 'all 0.2s ease',
                                ':hover': {
                                  backgroundColor: object === currentObject ? '#2C7A7B' : '#F7FAFC',
                                  transform: 'translateY(-1px)',
                                },
                              }}
                            >
                              {object}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{
                    backgroundColor: '#38B2AC',
                    padding: '15px 25px',
                    borderRadius: '8px',
                    color: 'white',
                    textAlign: 'center',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    marginLeft: '20px',
                  }}>
                    <p style={{
                      fontSize: '14px',
                      fontFamily: 'Montserrat, sans-serif',
                      fontWeight: '500',
                      marginBottom: '5px',
                    }}>SCORE</p>
                    <p style={{
                      fontSize: '32px',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: '600',
                    }}>{score}</p>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'training' && (
              <div style={{
                padding: '20px',
                backgroundColor: '#F7FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
              }}>
                <h1 style={{ 
                  fontSize: '32px',
                  marginBottom: '20px',
                  color: '#2C7A7B',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: '600',
                }}>Training Mode</h1>
                <div style={{ 
                  marginBottom: '30px',
                  textAlign: 'center',
                }}>
                  <button 
                    onClick={captureTrainingImage}
                    disabled={isCapturing}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      backgroundColor: isCapturing ? '#CBD5E0' : '#38B2AC',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: isCapturing ? 'not-allowed' : 'pointer',
                      fontFamily: 'Montserrat, sans-serif',
                      fontWeight: '500',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      ':hover': {
                        backgroundColor: isCapturing ? '#CBD5E0' : '#2C7A7B',
                        transform: isCapturing ? 'none' : 'translateY(-1px)',
                        boxShadow: isCapturing ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 4px 8px rgba(0, 0, 0, 0.15)',
                      },
                    }}
                  >
                    {isCapturing ? 'Capturing...' : 'Capture Training Image'}
                  </button>
                </div>
                <p style={{ 
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  textAlign: 'center',
                }}>
                  Click the button above to capture and upload a training image to the scavenger-training dataset.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - 30% width */}
        <div style={{ 
          flex: '0 0 30%',
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
          border: '1px solid #E2E8F0',
          height: 'fit-content',
        }}>
          <h2 style={{
            fontSize: '20px',
            color: '#2C7A7B',
            marginBottom: '20px',
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: '600',
          }}>Game Stats</h2>

          <p style={{
            color: '#4A5568',
            fontSize: '16px',
            fontFamily: 'Montserrat, sans-serif',
            marginBottom: '20px',
          }}>Total Objects Found: {totalObjectsFound}</p>

          <div style={{
            padding: '15px',
            backgroundColor: '#F7FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            marginBottom: '30px',
          }}>
            <h3 style={{
              color: '#2C7A7B',
              fontSize: '18px',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: '600',
              marginBottom: '15px',
            }}>Current Game</h3>
            
            {isGameActive ? (
              <>
                <p style={{
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  marginBottom: '10px',
                }}>Time Remaining: {formatTime(timeRemaining)}</p>
                <p style={{
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  marginBottom: '10px',
                }}>Score: {score}</p>
                <p style={{
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  marginBottom: '15px',
                }}>Skips: {skipCount}</p>
                <button
                  onClick={endGame}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F56565',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    ':hover': {
                      backgroundColor: '#E53E3E',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  End Game
                </button>
              </>
            ) : (
              <>
                <p style={{
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  marginBottom: '10px',
                }}>Score: {score}</p>
                <p style={{
                  color: '#4A5568',
                  fontSize: '16px',
                  fontFamily: 'Montserrat, sans-serif',
                  marginBottom: '10px',
                }}>Skips: {skipCount}</p>
                <button
                  onClick={startNewGame}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#38B2AC',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    ':hover': {
                      backgroundColor: '#2C7A7B',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  Start New Game
                </button>
              </>
            )}
          </div>

          <h2 style={{
            fontSize: '20px',
            color: '#2C7A7B',
            marginBottom: '20px',
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: '600',
          }}>Gallery</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '15px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '10px',
            backgroundColor: '#F7FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
          }}>
            {gallery.map((item, index) => (
              <div key={index} style={{
                position: 'relative',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}>
                <img 
                  src={item.image} 
                  alt={item.object}
                  style={{
                    width: '100%',
                    height: '150px',
                    objectFit: 'cover',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '8px',
                  backgroundColor: 'rgba(56, 178, 172, 0.9)',
                  color: 'white',
                  fontSize: '12px',
                  fontFamily: 'Montserrat, sans-serif',
                }}>
                  <div style={{ fontWeight: '600' }}>{item.object}</div>
                  <div>Confidence: {(Number(item.detection.confidence) * 100).toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
