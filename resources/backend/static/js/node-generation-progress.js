(() => {
    const labels = {
        queued: '排队中',
        retry: '等待重试',
        downloading: '下载结果',
        saving: '保存结果',
        jimeng_pending: '等待结果',
        cancel_requested: '正在停止',
    };

    function readTask(task) {
        if (task.status === 'succeeded') return {phase:task.status, progress:1};
        const progress = task.progress;
        let percent = task.progress_percent ?? progress?.percent;
        if (percent == null && typeof progress === 'string' && /^\s*\d+(?:\.\d+)?%\s*$/.test(progress)) {
            percent = parseFloat(progress);
        }
        if (percent == null && Number.isFinite(progress?.completed) && Number.isFinite(progress?.total) && progress.total > 0) {
            percent = progress.completed / progress.total * 100;
        }
        return {
            phase: task.status,
            progress: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : undefined,
        };
    }

    function estimatedPercent(elapsedMs) {
        const elapsed = Math.max(0, elapsedMs);
        return Math.max(1, Math.round(99 * (1 - Math.exp(-elapsed / 25000))));
    }

    function display(run, elapsedMs = 0) {
        if (Number.isFinite(run?.finishingPercent)) {
            return { label: '生成完成', value: run.finishingPercent };
        }
        const batch = run?.batch;
        if (batch && Number.isFinite(batch.done) && Number.isFinite(batch.total) && batch.total > 0) {
            const label = `已处理 ${batch.done}/${batch.total}`;
            if (batch.done >= batch.total) return { label, value: 100 };
            const partial = estimatedPercent(elapsedMs) / 100;
            const value = 100 * (batch.done + partial) / batch.total;
            return { label, value: Math.min(99, Math.round(value)), estimated: true };
        }
        if (Number.isFinite(run?.progress)) {
            const value = run.progress === 1 ? 100 : Math.min(99, Math.round(run.progress * 100));
            return { label: labels[run?.phase] || '生成中', value };
        }
        return { label: labels[run?.phase] || '生成中', value: estimatedPercent(elapsedMs), estimated: true };
    }

    async function finish(from, update, isActive) {
        if (from >= 100 || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const started = performance.now();
        while (isActive() && !document.hidden) {
            const fraction = Math.min(1, (performance.now() - started) / 320);
            const value = fraction === 1 ? 100 : Math.min(99, Math.round(from + (100 - from) * (1 - (1 - fraction) ** 2)));
            update(value);
            await new Promise(resolve => setTimeout(resolve, fraction === 1 ? 70 : 32));
            if (fraction === 1) return;
        }
    }

    function formatElapsed(ms) {
        const seconds = Math.max(0, Math.floor(ms / 1000));
        return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    }

    window.NoxNodeGenerationProgress = { readTask, display, estimatedPercent, finish, formatElapsed };
})();
