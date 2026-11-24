package com.replydesk.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch

private val DeviceGreen = Color(0xFF0F9D58)
private val CloudBlue = Color(0xFF4F6BED)
private val Brand = Color(0xFF3B5BDB)

val SAMPLES = linkedMapOf(
    "Late delivery" to "Hi, I ordered a birthday present for my son on the 12th and paid for express shipping. It still hasn't arrived and his party is on Saturday. The tracking page hasn't updated in four days. This is really stressful. Can someone tell me what's going on?",
    "Double charge" to "I've been charged twice for my monthly plan this month, two payments of \$29.99 on the same day. I only have one account. Please refund the extra charge as soon as possible, money is tight right now.",
    "Locked out" to "I can't log in to my account. I reset my password twice and it still says invalid credentials, and now it says my account is locked for 24 hours. I need to download my invoices today for my accountant!!",
)
val TONES = linkedMapOf(
    "Warm" to "warm and empathetic",
    "Professional" to "professional and formal",
    "Concise" to "brief and direct",
)

data class LogEntry(val step: String, val source: Source, val ms: Long, val mode: Mode, val online: Boolean)

class ReplyDeskViewModel : ViewModel() {
    private val ai = HybridAi()

    var message by mutableStateOf("")
    var tone by mutableStateOf("Warm")
    var agent by mutableStateOf("")
    var mode by mutableStateOf(Mode.PREFER_ON_DEVICE)
    var modelState by mutableStateOf<ModelState>(ModelState.Checking)
    var analysis by mutableStateOf<Timed<Analysis>?>(null)
    var draft by mutableStateOf("")
    var draftMeta by mutableStateOf<Pair<Source, Long>?>(null)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    val log = mutableStateListOf<LogEntry>()

    init { refreshModel() }

    fun refreshModel() = viewModelScope.launch {
        modelState = runCatching { ai.checkModel(mode) }.getOrElse { ModelState.Unavailable }
        if (modelState == ModelState.Ready) ai.warmUp(mode)
    }

    fun downloadModel() = viewModelScope.launch {
        runCatching { ai.download(mode).collect { modelState = it } }
            .onFailure { modelState = ModelState.Failed(it.message ?: "Download failed") }
    }

    fun run(online: Boolean) {
        if (message.isBlank()) { error = "Paste a customer message first."; return }
        error = null; busy = true; draft = ""; draftMeta = null; analysis = null
        viewModelScope.launch {
            try {
                val a = ai.analyze(mode, message)
                analysis = a
                log.add(0, LogEntry("Triage", a.source, a.ms, mode, online))
                val d = ai.draft(mode, message, TONES.getValue(tone), agent) { draft = it }
                draftMeta = d.source to d.ms
                log.add(0, LogEntry("Draft reply", d.source, d.ms, mode, online))
            } catch (e: Exception) {
                var msg = e.message ?: e.toString()
                if (Regex("app.?check|attestation|403|PERMISSION_DENIED", RegexOption.IGNORE_CASE).containsMatchIn(msg))
                    msg += "\n→ Register your App Check debug token from Logcat in the Firebase console."
                if (mode == Mode.ONLY_ON_DEVICE)
                    msg += "\n→ Only-on-device mode needs the Gemini Nano model downloaded on a supported phone."
                error = msg
            } finally {
                busy = false
            }
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Brand)) {
                Surface(Modifier.fillMaxSize(), color = Color(0xFFF6F7F9)) { ReplyDeskScreen() }
            }
        }
    }
}

private fun isOnline(context: Context): Boolean {
    val cm = context.getSystemService(ConnectivityManager::class.java)
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ReplyDeskScreen(vm: ReplyDeskViewModel = viewModel()) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val clipboard = LocalClipboardManager.current

    Column(
        Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(Brand, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) { Text("RD", color = Color.White, fontWeight = FontWeight.Bold) }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("ReplyDesk", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("Customer replies with AI that runs on your phone first", fontSize = 12.sp, color = Color.Gray)
            }
        }
        ModelStatusCard(vm)

        // Message
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("1. Customer message", fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SAMPLES.forEach { (name, text) ->
                        AssistChip(onClick = { vm.message = text }, label = { Text(name, fontSize = 12.sp) })
                    }
                }
                OutlinedTextField(
                    value = vm.message, onValueChange = { vm.message = it },
                    placeholder = { Text("Paste the customer's email or chat message…") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp),
                )
                Text("Tone", fontSize = 12.sp, color = Color.Gray)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    TONES.keys.forEachIndexed { i, t ->
                        SegmentedButton(
                            selected = vm.tone == t, onClick = { vm.tone = t },
                            shape = SegmentedButtonDefaults.itemShape(i, TONES.size),
                        ) { Text(t, fontSize = 12.sp) }
                    }
                }
                OutlinedTextField(
                    value = vm.agent, onValueChange = { vm.agent = it },
                    label = { Text("Sign as") }, placeholder = { Text("AJ, Customer Support") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                ModePicker(vm)
                Button(
                    onClick = { vm.run(isOnline(context)) }, enabled = !vm.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (vm.busy) "Working…" else "Analyze & draft reply") }
                vm.error?.let { Text(it, color = Color(0xFFC0392B), fontSize = 13.sp) }
            }
        }

        // Triage + draft
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("2. Triage", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    vm.analysis?.let { SourceBadge(it.source, it.ms) }
                }
                val a = vm.analysis?.value
                if (a == null) {
                    Text("Run a message to see the summary, category, sentiment and urgency.", color = Color.Gray, fontSize = 13.sp)
                } else {
                    Text(a.summary, fontSize = 14.sp)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Tag("Category: ${a.category}")
                        Tag("Sentiment: ${a.sentiment}")
                        Tag("Urgency: ${a.urgency}")
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("3. Draft reply", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    vm.draftMeta?.let { SourceBadge(it.first, it.second) }
                }
                OutlinedTextField(
                    value = vm.draft, onValueChange = { vm.draft = it },
                    placeholder = { Text("The drafted reply appears here.") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                )
                OutlinedButton(
                    onClick = { clipboard.setText(AnnotatedString(vm.draft)) },
                    enabled = vm.draft.isNotBlank(), modifier = Modifier.align(Alignment.End),
                ) { Text("Copy reply") }
            }
        }

        StatsCard(vm)
    }
}

@Composable
private fun ModelStatusCard(vm: ReplyDeskViewModel) {
    Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val (text, color) = when (val s = vm.modelState) {
                ModelState.Checking -> "Checking for Gemini Nano…" to Color.Gray
                ModelState.Ready -> "Gemini Nano is ready on this phone" to DeviceGreen
                ModelState.Downloadable -> "Gemini Nano can be downloaded to this phone" to Color(0xFFB54708)
                is ModelState.Downloading -> "Downloading Gemini Nano…" to Color(0xFFB54708)
                ModelState.Unavailable -> "No on-device model on this phone: replies come from the cloud" to Color.Gray
                is ModelState.Failed -> s.message to Color(0xFFC0392B)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(9.dp).background(color, CircleShape))
                Spacer(Modifier.width(8.dp))
                Text(text, fontSize = 13.sp, color = color, modifier = Modifier.weight(1f))
            }
            val st = vm.modelState
            if (st is ModelState.Downloading) {
                if (st.progress != null) LinearProgressIndicator(progress = { st.progress }, Modifier.fillMaxWidth())
                else LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            if (st == ModelState.Downloadable || st is ModelState.Failed) {
                OutlinedButton(onClick = { vm.downloadModel() }) { Text("Enable on-device AI") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModePicker(vm: ReplyDeskViewModel) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = vm.mode.label, onValueChange = {}, readOnly = true,
            label = { Text("Inference mode") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Mode.entries.forEach { m ->
                DropdownMenuItem(text = { Text(m.label) }, onClick = { vm.mode = m; open = false; vm.refreshModel() })
            }
        }
    }
}

@Composable
private fun SourceBadge(source: Source, ms: Long) {
    val (label, color) = when (source) {
        Source.DEVICE -> "On this phone" to DeviceGreen
        Source.CLOUD -> "Cloud · Gemini" to CloudBlue
        Source.UNKNOWN -> "Unknown" to Color.Gray
    }
    Text(
        "$label · $ms ms", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = color,
        modifier = Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

@Composable
private fun Tag(text: String) {
    Text(
        text, fontSize = 12.sp,
        modifier = Modifier.background(Color(0xFFEEF0F4), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun StatsCard(vm: ReplyDeskViewModel) {
    val device = vm.log.count { it.source == Source.DEVICE }
    val cloud = vm.log.count { it.source == Source.CLOUD }
    val total = device + cloud
    Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Where did the AI run?", fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("$device", "on this phone", Modifier.weight(1f))
                Stat("$cloud", "in the cloud", Modifier.weight(1f))
                Stat(if (total == 0) "–" else "${device * 100 / total}%", "kept on device", Modifier.weight(1f))
            }
            vm.log.forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).background(if (e.source == Source.DEVICE) DeviceGreen else CloudBlue, CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${e.step}: ${if (e.source == Source.DEVICE) "on this phone" else if (e.source == Source.CLOUD) "in the cloud" else "unknown"} · ${e.ms} ms · ${e.mode.label.lowercase()} · ${if (e.online) "online" else "offline"}",
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    Column(modifier.background(Color(0xFFF8F9FB), RoundedCornerShape(10.dp)).padding(12.dp)) {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(label, fontSize = 11.sp, color = Color.Gray)
    }
}
