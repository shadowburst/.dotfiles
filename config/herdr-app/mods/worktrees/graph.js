import { div, svg, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, Button, Scrollbar, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { settings } from "herdr";
import { rowKey, rowName } from "./data.js";
import { commitDetails, firstParents, HEIGHT, history, laneX, layout, PAGE } from "./history.js";

const LABELS = 264;
const tones = (t) => [t.ansi4, t.ansi2, t.ansi5, t.ansi3, t.ansi6, t.ansi1];

// One graph per popup. It owns pagination, selection and read-only inspection.
export class Graph {
  constructor(cx, selectRef) {
    this.selectRef = selectRef;
    this.handle = cx.focus_handle();
    this.detailsHandle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.detailsScroll = VirtualListScrollHandle.new();
    this.commits = [];
    this.rows = [];
    this.refs = [];
    this.chain = new Set();
    this.version = 0;
    this.width = 40;
    this.enabled = true;
    // The renderer records the visible range; start I/O outside native layout.
    cx.timer.every(300, (cx) => {
      if (this.enabled && !this.loading && !this.cancelled && !this.error && this.more && this.visibleEnd >= this.rows.length - 5) this.load(cx);
    });
  }

  configure(repo, refs, selected, cx, reveal = false, on = null) {
    const catalogKey = JSON.stringify([on, repo, refs.map(rowKey).sort()]);
    if (catalogKey !== this.catalogKey) this.details = null;
    this.catalogKey = catalogKey;
    this.refs = refs;
    this.selected = selected;
    const tips = [...new Set(refs.map((r) => r.sha).filter(Boolean))].sort();
    const key = JSON.stringify([on, repo, tips]);
    if (key === this.sourceKey) {
      this.chain = firstParents(this.commits, selected?.sha);
      if (reveal) this.reveal(cx);
      return;
    }
    const anchor = !reveal && this.rows[this.visibleStart ?? 0]?.sha;
    const seeking = Boolean(this.pending);
    const count = Math.max(PAGE, this.commits.length);
    if (repo !== this.repo) this.details = null;
    this.repo = repo;
    this.machine = on;
    this.sourceKey = key;
    this.tips = tips;
    this.version++;
    this.commits = [];
    this.rows = [];
    this.more = Boolean(tips.length);
    this.loading = false;
    this.error = "";
    this.cancelled = false;
    this.visibleEnd = 0;
    this.pending = reveal || !anchor || seeking ? selected?.sha : null;
    this.load(cx, count, anchor);
  }

  load(cx, count = PAGE, anchor) {
    if (this.loading || !this.more) return;
    this.cancelled = false;
    this.error = "";
    this.loading = true;
    const version = this.version;
    cx.spawn(async (cx) => {
      try {
        do {
          const result = await history(this.repo, this.tips, this.commits.length, count, this.machine);
          if (version !== this.version) return;
          this.commits.push(...result.commits);
          this.more = result.more;
          const graph = layout(this.commits);
          this.rows = graph.rows;
          this.width = graph.width;
          this.chain = firstParents(this.commits, this.selected?.sha);
          const at = this.rows.findIndex((r) => r.sha === (this.pending || anchor));
          if (at >= 0) {
            this.scroll.scroll_to_item(at, this.pending ? "center" : "top");
            if (this.pending) this.cursor = this.pending;
            this.pending = null;
            anchor = null;
          }
          cx.notify();
          count = PAGE;
        } while (this.more && this.pending);
        if (this.pending) { this.error = "The selected tip is no longer available. Refresh the branch list."; this.pending = null; }
      } catch (e) {
        if (version === this.version) this.error = String(e.message ?? e);
      } finally {
        if (version === this.version) { this.loading = false; cx.notify(); }
      }
    });
    cx.notify();
  }

  cancel(cx) {
    this.version++;
    this.loading = false;
    this.pending = null;
    this.cancelled = true;
    cx.notify();
  }

  reveal(cx) {
    const sha = this.selected?.sha;
    if (!sha) return;
    const at = this.rows.findIndex((r) => r.sha === sha);
    this.cursor = sha;
    this.cancelled = false;
    if (at >= 0) this.scroll.scroll_to_item(at, "center");
    else { this.pending = sha; this.load(cx); }
  }

  inspect(sha, cx) {
    const commit = this.rows.find((r) => r.sha === sha);
    if (!commit) return;
    this.pending = null;
    this.cursor = sha;
    this.details = { ...commit, loading: true };
    this.detailsAt = 0;
    this.detailsScroll.scroll_to_item(0);
    const repo = this.repo;
    const machine = this.machine;
    cx.spawn(async (cx) => {
      try {
        const data = await commitDetails(repo, sha, machine);
        if (this.repo === repo && this.machine === machine && this.details?.sha === sha) this.details = { ...commit, ...data };
      } catch (e) {
        if (this.repo === repo && this.machine === machine && this.details?.sha === sha) this.details = { ...commit, error: String(e.message ?? e) };
      }
      cx.notify();
    });
    cx.notify();
  }

  key(key, cx) {
    if (this.detailsHandle.is_focused() && this.details) {
      const end = this.detailLines().length - 1;
      const step = ["j", "down"].includes(key) ? 1 : ["k", "up"].includes(key) ? -1 : key === "ctrl-d" ? 10 : key === "ctrl-u" ? -10 : 0;
      if (!step && !["home", "end", "g", "G"].includes(key)) return false;
      this.detailsAt = key === "home" || key === "g" ? 0 : key === "end" || key === "G" ? end : Math.max(0, Math.min(end, (this.detailsAt ?? 0) + step));
      this.detailsScroll.scroll_to_item(this.detailsAt, "top");
      cx.notify();
      return true;
    }
    if (!this.handle.is_focused()) return false;
    const at = Math.max(0, this.rows.findIndex((r) => r.sha === this.cursor));
    const step = ["j", "down"].includes(key) ? 1 : ["k", "up"].includes(key) ? -1 : key === "ctrl-d" ? 10 : key === "ctrl-u" ? -10 : 0;
    if (step || ["home", "end", "g", "G"].includes(key)) {
      this.pending = null;
      const next = key === "home" || key === "g" ? 0 : key === "end" || key === "G" ? this.rows.length - 1 : Math.max(0, Math.min(this.rows.length - 1, at + step));
      this.cursor = this.rows[next]?.sha;
      this.scroll.scroll_to_item(Math.max(next, 0), "center");
      if (next >= this.rows.length - 5) this.load(cx);
    } else if (key === "enter") this.inspect(this.cursor || this.rows[at]?.sha, cx);
    else if (key === "r") this.reveal(cx);
    else if (key === "c" && this.loading) this.cancel(cx);
    else return false;
    cx.notify();
    return true;
  }

  refsAt(sha, refs = this.refs) { return refs.filter((r) => r.sha === sha); }

  labels(sha, catalog = this.refs, selected = this.selected) {
    const refs = this.refsAt(sha, catalog);
    const primary = refs.find((r) => rowKey(r) === (selected && rowKey(selected))) ?? refs.find((r) => !r.remote) ?? refs[0];
    if (!primary) return [];
    const companion = primary.upstream && refs.find((r) => r.remote && rowName(r) === primary.upstream);
    const shown = companion ? [primary, companion] : [primary];
    const extra = refs.length - shown.length;
    const room = LABELS - 12 - (extra ? 38 : 0);
    return [...shown.map((r) => ({ ref: r, width: Math.min(room / shown.length, rowName(r).length * 6.5 + 38 + (r.dirty ? 16 : 0)) })), ...(extra ? [{ extra, width: 38 }] : [])];
  }

  click(sha, cx) {
    this.handle.focus();
    let x = this.pressX - this.width;
    for (const label of this.labels(sha, this.pressRefs, this.pressSelected)) {
      if (x >= 0 && x < label.width && label.ref) { this.selectRef(rowKey(label.ref), cx); return; }
      x -= label.width;
    }
    this.inspect(sha, cx);
  }

  renderRow(row, t) {
    const palette = tones(t);
    const selected = this.selected?.sha === row.sha;
    const related = this.chain.has(row.sha);
    const lines = div().relative().flex_none().w(this.width).h(HEIGHT);
    for (const edge of row.edges) {
      const active = edge.source ? edge.first && this.chain.has(edge.source) : this.chain.has(edge.target);
      const x = laneX(edge.from), to = laneX(edge.to);
      const y = HEIGHT * edge.start, end = HEIGHT * edge.end;
      const path = PathBuilder.stroke(active ? 2.5 : 1.5).move_to(x, y);
      if (x === to) path.line_to(to, end);
      else path.cubic_bezier_to(to, end, x, (y + end) / 2, to, (y + end) / 2);
      lines.child(window.paint_path(path.build(), palette[edge.color]).absolute().inset_0().when(!active && Boolean(this.selected), (el) => el.opacity(0.45)));
    }
    lines.child(div().absolute().left(laneX(row.lane) - 4).top(HEIGHT / 2 - 4).size(8).rounded_full()
      .bg(row.parents.length > 1 ? t.background : palette[row.color]).border(2).border_color(palette[row.color]));
    if (selected) lines.child(div().absolute().left(laneX(row.lane) - 7).top(HEIGHT / 2 - 7).size(14).rounded_full().border(2).border_color(t.accent));
    const labels = h_flex().flex_none().w(LABELS).h_full().items_center();
    for (const label of this.labels(row.sha)) {
      const r = label.ref;
      const on = r && this.selected && rowKey(r) === rowKey(this.selected);
      labels.child(h_flex().w(label.width).flex_none().px(4).child(h_flex().flex_none().max_w(label.width - 8).h(21).px(5).gap(4).items_center().rounded(5).border(1)
        .border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).text_size(10.5).text_color(on ? t.foreground : t.muted)
        .when(Boolean(r), (el) => el.child(svg(`mods/workspace-chrome/${r.remote ? "server" : "branch"}.svg`).size(11).flex_none().accessibility_label(r.remote ? "Remote branch" : "Local branch")))
        .child(div().truncate().child(r ? rowName(r) : `+${label.extra}`))
        .when(Boolean(r?.dirty), (el) => el.child(svg("mods/worktrees/pencil.svg").size(11).flex_none().text_color(t.ansi3).accessibility_label("Uncommitted changes")))));
    }
    return h_flex().h(HEIGHT).w_full().items_center()
      .bg(this.cursor === row.sha ? t.selected : selected ? t.hover : "#00000000")
      .role("list_box_option").aria_selected(this.cursor === row.sha)
      .accessibility_label(`${row.subject}; ${this.refsAt(row.sha).map(rowName).join(", ")}; ${row.sha}`)
      .child(lines).child(labels)
      .child(div().flex_1().min_w(0).pr(12).truncate().text_size(12).text_color(related ? t.foreground : t.muted).child(row.subject));
  }

  render(t) {
    const rows = this.rows;
    const totalWidth = Math.max(620, this.width + LABELS + 300);
    const list = div().flex_1().min_h(0).relative().overflow_x_scrollbar()
      .child(v_flex().w_full().min_w(totalWidth).h_full().relative()
        .on_mouse_down("left", (e) => {
          this.pressX = (e.local_position?.x ?? -1) / (settings().zoom || 1);
          this.pressRefs = this.refs;
          this.pressSelected = this.selected;
        })
        .on_scroll_wheel(() => { this.pending = null; this.cancelled = false; })
        .child(v_virtual_list("wt-graph-rows", rows.length, HEIGHT, (i) => rows[i].sha, (range) => {
          this.visibleStart = range.start;
          this.visibleEnd = range.end;
          return rows.slice(range.start, range.end).map((r) => this.renderRow(r, t));
        }).track_scroll(this.scroll).role("list_box").accessibility_label("Commit graph").on_item_click((sha, cx) => this.click(sha, cx)).size_full())
        .child(Scrollbar.vertical("wt-graph-rows").absolute().inset_0()));
    const action = (id, text, click, icon) => Button.new(id).flex().flex_none().gap(4).items_center().px(7).py(3).rounded(4).cursor_pointer().accessibility_label(text).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => click(cx)).when(Boolean(icon), (el) => el.child(svg(`mods/workspace-chrome/${icon}.svg`).size(11))).child(text);
    return v_flex().size_full().track_focus(this.handle).key_context("WtGraph")
      .child(v_flex().flex_1().min_h(0).relative()
        .child(rows.length ? list : div().flex_1().flex().items_center().justify_center().text_color(t.dim)
          .child(this.loading || this.error ? "" : this.refs.length ? "No commits yet." : "No branch matches."))
        .when(Boolean(this.loading || this.error), (el) => el.child(h_flex().absolute().bottom(8).left(8).right(16).px(8).py(4).gap(8).items_center()
          .rounded(6).border(1).border_color(t.border).bg(t.popover).text_size(11).text_color(this.error ? t.blocked : t.muted)
          .child(div().flex_1().min_w(0).truncate().child(this.error || (this.pending ? `Finding ${rowName(this.selected)}…` : "Loading history…")))
          .when(this.loading, (el) => el.child(action("wt-graph-cancel", "Cancel", (cx) => this.cancel(cx))))
          .when(Boolean(this.error), (el) => el.child(action("wt-graph-retry", "Retry", (cx) => this.load(cx)))))))
      .when(Boolean(this.details), (el) => el.child(this.detailsView(t, action)));
  }

  detailsView(t, action) {
    const d = this.details;
    const lines = this.detailLines();
    return v_flex().flex_none().h(220).border_t(1).border_color(t.border).track_focus(this.detailsHandle)
      .on_mouse_down("left", () => this.detailsHandle.focus())
      .child(h_flex().flex_none().h(30).px(10).gap(8).items_center().text_size(11).text_color(t.muted)
        .child(div().flex_1().truncate().child(`${d.author} · ${d.date}`))
        .child(action("wt-details-close", "Close details", (cx) => { this.details = null; this.handle.focus(); cx.notify(); })))
      .child(h_flex().flex_none().h(28).px(8).gap(4).overflow_x_scrollbar().children(this.refsAt(d.sha).map((r) => action(`wt-detail-ref-${rowKey(r)}`, rowName(r), (cx) => this.selectRef(rowKey(r), cx), r.remote ? "server" : "branch"))))
      .child(div().flex_1().min_h(0).overflow_x_scrollbar().child(v_flex().w_full().min_w(lines.reduce((width, s) => Math.max(width, s.length * 7 + 24), 300)).h_full().relative()
        .child(v_virtual_list("wt-commit-details", lines.length, 18, (i) => String(i), (range) => lines.slice(range.start, range.end).map((line) =>
          div().h(18).px(12).font_family(settings().font_family ?? "JetBrains Mono").text_size(11).text_color(t.muted).child(line || " ")))
          .track_scroll(this.detailsScroll).size_full())
        .child(Scrollbar.vertical("wt-commit-details").absolute().inset_0())));
  }

  detailLines() {
    const d = this.details;
    return [d.sha, ...(d.parents.length ? d.parents.map((sha) => `Parent: ${sha}`) : ["Root commit"]), "", d.loading ? "Loading commit details…" : d.error || d.message, "", d.files || ""]
      .join("\n").replaceAll("\t", "    ").split("\n");
  }
}
