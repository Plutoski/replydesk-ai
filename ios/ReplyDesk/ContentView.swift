import SwiftUI
import UIKit

struct ContentView: View {
    @State private var vm = TicketViewModel()

    // Fictional sample tickets (same as the web app).
    private let samples: [(String, String)] = [
        ("Double charge", "Hi, my name is Sarah Jones. I've been charged twice for my monthly plan, two payments of $29.99 on the same day, on my Visa 4111 1111 1111 1111. Order #A7731920. Please refund the extra charge, money is tight right now. You can reach me on +1 (403) 555-0198.\n\nThanks,\nSarah"),
        ("Late delivery", "Hello, I ordered a birthday present for my son Leo on the 12th and paid for express shipping. Tracking number TRK88231045 hasn't updated in four days and his party is on Saturday. Delivery address is 1420 Elbow Drive SW, Calgary T2S 2N4. Can someone tell me what's going on?\n\nRegards,\nMarcus Bell"),
        ("Cancelled flight", "I'm Tunde Bakare. Booking reference ABX49213, my flight to London was cancelled this morning and nobody at the airport can help. I need to know if I can be rebooked tomorrow or get a refund. Email me at tunde.b@example.com or call 07700 900123."),
        ("Long thread", "Hi again, this is the third time I'm writing about this.\n\nAccount ACCT-558120. I moved house last month to 88 Riverside Crescent NW, Calgary T3A 0B2 and updated my address online, but my new bank card still went to my old address. Then I got an email saying my account was locked because of 'unusual activity', which was me logging in from the new place. When I called, I waited 50 minutes and the call dropped.\n\nSo my questions: Has my address actually been updated? Why was my account locked and is it unlocked now? Where is my new card, and has the old one been cancelled? Will I be charged the late fee on my bill, since I couldn't log in to pay? And can someone please call me back instead of me waiting on hold again?\n\nMy number is (587) 555-0142 and my email is priya.patel@example.com.\n\n> On Nov 18, Support wrote:\n> Thanks for contacting us. Your request has been received and a member of the team will respond within 48 hours.\n\nIt has been more than 48 hours.\n\nPriya Patel"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    statusBar
                    messageCard
                    if vm.busy || vm.finished || vm.errorText != nil || !vm.routeWhy.isEmpty {
                        stepsCard
                        resultCard
                        privacyCard
                    }
                    statsRow
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("ReplyDesk")
            .scrollDismissesKeyboard(.interactively)
            .alert("Send masked text to Gemini?", isPresented: Binding(
                get: { vm.approvalPending },
                set: { shown in if !shown && vm.approvalPending { vm.answerApproval(false) } })
            ) {
                Button("Send masked text") { vm.answerApproval(true) }
                Button("Keep it on this iPhone", role: .cancel) { vm.answerApproval(false) }
            } message: {
                Text("No on-device model checked this message, so names were masked by pattern rules only. Check the masked text:\n\n" + vm.approvalText)
            }
        }
    }

    // MARK: Sections

    private var statusBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("AI replies for support agents. Customer details stay on your iPhone.")
                .font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Pill(text: vm.online ? "Online" : "Offline", color: vm.online ? .green : .orange)
                Pill(text: vm.deviceStatus, color: vm.deviceStatus.contains("ready") ? .green : .gray)
            }
            Toggle(isOn: $vm.localOnly) {
                VStack(alignment: .leading) {
                    Text("Local only").font(.subheadline.weight(.semibold))
                    Text("Never call the cloud, even for long tickets.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .card()
    }

    private var messageCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Customer message").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(samples, id: \.0) { s in
                        Button(s.0) { vm.message = s.1 }
                            .accessibilityHint("Fills in a fictional sample ticket")
                            .buttonStyle(.bordered).controlSize(.small).clipShape(Capsule())
                    }
                }
            }
            TextEditor(text: $vm.message)
                .frame(minHeight: 160)
                .padding(6)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
            Picker("Tone", selection: $vm.tone) {
                ForEach(["Warm", "Professional", "Concise"], id: \.self) { Text($0) }
            }
            .pickerStyle(.segmented)
            TextField("Sign as (your name)", text: $vm.agent)
                .textFieldStyle(.roundedBorder)
            Button {
                Task { await vm.run() }
            } label: {
                Text(vm.busy ? "Working…" : "Mask, triage & draft reply")
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(vm.busy)
            Picker("Failure drill", selection: $vm.drill) {
                ForEach(TicketViewModel.Drill.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.menu)
            Text("Failure drill: see what happens when something breaks.")
                .font(.caption).foregroundStyle(.secondary)
            if let e = vm.errorText {
                Text(e).font(.footnote).foregroundStyle(.red)
            }
        }
        .card()
    }

    private var stepsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How this ticket was handled").font(.headline)
            if !vm.receipt.isEmpty {
                Text(vm.receipt)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(vm.cloudSaw.isEmpty ? .green : .blue)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background((vm.cloudSaw.isEmpty ? Color.green : Color.blue).opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityAddTraits(.updatesFrequently)
            }
            ForEach(Array(vm.steps.enumerated()), id: \.element.id) { i, s in
                HStack(alignment: .top, spacing: 10) {
                    ZStack {
                        Circle().fill(s.state == .done ? Color.green.opacity(0.15) : Color(.systemGray5)).frame(width: 26, height: 26)
                        if s.state == .running { ProgressView().controlSize(.mini) }
                        else { Text("\(i + 1)").font(.caption.bold()) }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.title).font(.subheadline.weight(.semibold))
                        Text(s.id == "route" && !vm.routeWhy.isEmpty ? vm.routeWhy : s.detail)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    if !s.badge.isEmpty { Pill(text: s.badge, color: s.isCloud ? .blue : .green) }
                }
            }
            ForEach(vm.notes) { n in
                Label(n.text, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange)
            }
        }
        .card()
    }

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let t = vm.triage {
                Text(t.summary).font(.subheadline)
                HStack {
                    Pill(text: t.category.capitalized, color: .gray)
                    Pill(text: t.sentiment.capitalized, color: sentimentColor(t.sentiment))
                    Pill(text: "\(t.urgency.capitalized) urgency", color: urgencyColor(t.urgency))
                }
                Divider()
            }
            HStack {
                Text("Draft reply").font(.headline)
                Spacer()
                Button("Copy") { UIPasteboard.general.string = vm.draft }
                    .buttonStyle(.bordered).controlSize(.small).disabled(vm.draft.isEmpty)
            }
            TextEditor(text: $vm.draft)
                .frame(minHeight: 200)
                .padding(6)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
            if vm.draft.contains("[CHECK:") {
                Text("Items marked [CHECK: …] need you to look something up before sending.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .card()
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What the cloud saw").font(.headline)
            if vm.finished && vm.cloudSaw.isEmpty {
                Label("Nothing left this iPhone\(vm.localOnly ? " (local-only policy)" : "").", systemImage: "checkmark.shield.fill")
                    .foregroundStyle(.green).font(.subheadline.weight(.semibold))
            }
            ForEach(vm.cloudSaw) { c in
                DisclosureGroup("\(c.step): masked prompt sent to Gemini") {
                    Text(highlighted(c.prompt)).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                }
                .font(.subheadline)
            }
            if !vm.masked.isEmpty {
                Divider()
                Text("Masked message (what the AI works with)").font(.subheadline.weight(.semibold))
                Text(highlighted(vm.masked)).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            }
        }
        .card()
    }

    private var statsRow: some View {
        HStack {
            Stat(value: "\(vm.tickets)", label: "tickets")
            Stat(value: vm.devicePercent, label: "steps on this iPhone")
            Stat(value: "\(vm.protected)", label: "details masked")
            Stat(value: vm.tickets == 0 ? "–" : "\(vm.rawSent)", label: "raw details to cloud (\(vm.cloudChecked) checked)")
        }
    }

    private func sentimentColor(_ s: String) -> Color {
        switch s { case "angry": return .red; case "frustrated": return .orange; case "positive": return .green; default: return .gray }
    }

    private func urgencyColor(_ u: String) -> Color {
        switch u { case "high": return .red; case "medium": return .orange; case "low": return .green; default: return .gray }
    }

    /// Highlight [TOKEN_1] placeholders.
    private func highlighted(_ text: String) -> AttributedString {
        var a = AttributedString(text)
        var search = text.startIndex
        while let r = text.range(of: #"\[[A-Z]+_\d+\]"#, options: .regularExpression, range: search..<text.endIndex) {
            if let ar = Range(r, in: a) { a[ar].backgroundColor = .yellow.opacity(0.35) }
            search = r.upperBound
        }
        return a
    }
}

// MARK: - Small components

private struct Pill: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color == .gray ? Color.secondary : color)
            .lineLimit(1)
    }
}

private struct Stat: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3.bold())
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}

private extension View {
    func card() -> some View {
        self.padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

#Preview { ContentView() }
