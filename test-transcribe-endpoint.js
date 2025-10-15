const FormData = require("form-data");
const axios = require("axios");
const fs = require("fs");

async function testTranscribe() {
  try {
    console.log("Testing /api/ai/transcribe endpoint...");

    // Create a test audio file (you'll need to replace this with actual audio)
    const testAudioBuffer = Buffer.from("test audio data");

    const formData = new FormData();
    formData.append("file", testAudioBuffer, {
      filename: "test.webm",
      contentType: "audio/webm",
    });
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const response = await axios.post(
      "http://localhost:5000/api/ai/transcribe",
      formData,
      {
        headers: formData.getHeaders(),
        validateStatus: () => true,
      }
    );

    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(response.data, null, 2));

    if (response.status === 200) {
      console.log("✅ Transcription endpoint works!");
    } else {
      console.log("❌ Transcription endpoint failed");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testTranscribe();
