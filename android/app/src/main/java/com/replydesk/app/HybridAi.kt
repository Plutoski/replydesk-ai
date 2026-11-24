package com.replydesk.app

import com.google.firebase.Firebase
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

/** Same cloud model the web app uses by default, so both platforms behave alike. */
const val CLOUD_MODEL = "gemini-3.5-flash-lite"

enum class Mode(val label: String, val sdk: InferenceMode) {
    PREFER_ON_DEVICE("Prefer on-device", InferenceMode.PREFER_ON_DEVICE),
    ONLY_ON_DEVICE("Only on-device", InferenceMode.ONLY_ON_DEVICE),
    PREFER_IN_CLOUD("Prefer cloud", InferenceMode.PREFER_IN_CLOUD),
    ONLY_IN_CLOUD("Only cloud", InferenceMode.ONLY_IN_CLOUD),
}

enum class Source { DEVICE, CLOUD, UNKNOWN }

data class Analysis(val summary: String, val category: String, val sentiment: String, val urgency: String)
data class Timed<T>(val value: T, val ms: Long, val source: Source)

sealed interface ModelState {
    data object Checking : ModelState
    data object Ready : ModelState
    data object Downloadable : ModelState
    data class Downloading(val progress: Float?) : ModelState
    data object Unavailable : ModelState
    data class Failed(val message: String) : ModelState
}

@OptIn(PublicPreviewAPI::class)
class HybridAi {
    private val cache = mutableMapOf<Pair<Mode, String>, GenerativeModel>()

    private fun model(mode: Mode, kind: String): GenerativeModel = cache.getOrPut(mode to kind) {
        val ai = Firebase.ai(backend = GenerativeBackend.googleAI())
        if (kind == "analysis") {
            ai.generativeModel(
                modelName = CLOUD_MODEL,
                generationConfig = generationConfig { responseMimeType = "application/json" },
                onDeviceConfig = OnDeviceConfig(mode = mode.sdk, maxOutputTokens = 200),
            )
        } else {
            ai.generativeModel(
                modelName = CLOUD_MODEL,
                // On-device output over ~256 tokens isn't recommended.
                onDeviceConfig = OnDeviceConfig(mode = mode.sdk, maxOutputTokens = 256),
            )
        }
    }

    private fun sourceOf(raw: Any?): Source {
        val s = raw?.toString()?.uppercase() ?: return Source.UNKNOWN
        return when {
            "DEVICE" in s -> Source.DEVICE
            "CLOUD" in s -> Source.CLOUD
            else -> Source.UNKNOWN
        }
    }

    suspend fun checkModel(mode: Mode): ModelState {
        val ext = model(mode, "draft").onDeviceExtension ?: return ModelState.Unavailable
        return when (ext.checkStatus()) {
            OnDeviceModelStatus.AVAILABLE -> ModelState.Ready
            OnDeviceModelStatus.DOWNLOADABLE -> ModelState.Downloadable
            OnDeviceModelStatus.DOWNLOADING -> ModelState.Downloading(null)
            else -> ModelState.Unavailable
        }
    }

    /** The SDK never downloads on its own; this starts the AICore download. */
    fun download(mode: Mode): Flow<ModelState> {
        val ext = model(mode, "draft").onDeviceExtension
            ?: return kotlinx.coroutines.flow.flowOf(ModelState.Unavailable)
        var total = 0L
        return ext.download().map { status ->
            when (status) {
                is DownloadStatus.DownloadStarted -> { total = status.bytesToDownload; ModelState.Downloading(0f) }
                is DownloadStatus.DownloadInProgress -> ModelState.Downloading(
                    if (total > 0) status.totalBytesDownloaded.toFloat() / total else null
                )
                is DownloadStatus.DownloadCompleted -> ModelState.Ready
                is DownloadStatus.DownloadFailed -> ModelState.Failed("Model download failed")
                else -> ModelState.Downloading(null)
            }
        }
    }

    suspend fun warmUp(mode: Mode) {
        runCatching { model(mode, "draft").onDeviceExtension?.warmUp() }
    }

    suspend fun analyze(mode: Mode, message: String): Timed<Analysis> {
        val prompt = "You are a customer-service triage assistant. Read the customer message and return ONLY a JSON object with keys:\n" +
            "\"summary\" (one sentence, max 25 words), " +
            "\"category\" (one of: billing, delivery, account, technical, complaint, other), " +
            "\"sentiment\" (one of: positive, neutral, frustrated, angry), " +
            "\"urgency\" (one of: low, medium, high).\n\nCustomer message:\n---\n$message\n---"
        val t0 = System.currentTimeMillis()
        val response = model(mode, "analysis").generateContent(prompt)
        val ms = System.currentTimeMillis() - t0
        val text = response.text.orEmpty()
        val analysis = runCatching {
            val json = JSONObject(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1))
            Analysis(
                json.optString("summary"),
                json.optString("category", "other"),
                json.optString("sentiment", "neutral"),
                json.optString("urgency", "medium"),
            )
        }.getOrElse { Analysis(text.trim(), "other", "neutral", "medium") }
        return Timed(analysis, ms, sourceOf(response.inferenceSource))
    }

    suspend fun draft(
        mode: Mode, message: String, tone: String, agent: String, onText: (String) -> Unit,
    ): Timed<String> {
        val who = agent.ifBlank { "Customer Support" }
        val prompt = "You are $who, a customer service representative. Write a reply to the customer message below.\n" +
            "Tone: $tone. Acknowledge the issue, say clearly what happens next, and keep it under 140 words.\n" +
            "Do not invent order numbers, refunds, or policies that are not in the message. " +
            "Use [placeholders] for anything you would need to look up.\n" +
            "Sign off as $who.\n\nCustomer message:\n---\n$message\n---"
        val t0 = System.currentTimeMillis()
        val sb = StringBuilder()
        var source = Source.UNKNOWN
        model(mode, "draft").generateContentStream(prompt).collect { chunk ->
            if (source == Source.UNKNOWN) source = sourceOf(chunk.inferenceSource)
            chunk.text?.let { sb.append(it); onText(sb.toString()) }
        }
        return Timed(sb.toString(), System.currentTimeMillis() - t0, source)
    }
}
