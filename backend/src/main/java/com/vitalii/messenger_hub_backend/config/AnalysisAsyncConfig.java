package com.vitalii.messenger_hub_backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AnalysisAsyncConfig {

    /**
     * One analysis at a time, and a queue behind it.
     *
     * Spring's default async executor would start every requested run immediately. That is
     * wrong here for a physical reason: local inference saturates the CPU, so two runs in
     * parallel do not finish in half the time — they finish in roughly twice the time each,
     * while making the rest of the application sluggish. Serialising them keeps the first
     * result arriving as early as it possibly can.
     */
    @Bean(name = "taskExecutor")
    public TaskExecutor analysisExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("analysis-");
        // Queued work outlives a shutdown request just long enough to finish cleanly.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
