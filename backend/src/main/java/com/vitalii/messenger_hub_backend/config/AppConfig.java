package com.vitalii.messenger_hub_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class AppConfig {

    /**
     * HTTP client for the messenger services, with timeouts so a hung service cannot hold a thread
     * (and the background gate) forever. The read timeout is long because Telethon waits out short
     * flood limits and media transfers can be slow.
     */
    @Bean
    public RestTemplate restTemplate(
            @Value("${messenger.http.connect-timeout-seconds:5}") long connectTimeout,
            @Value("${messenger.http.read-timeout-seconds:90}") long readTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(connectTimeout));
        factory.setReadTimeout(Duration.ofSeconds(readTimeout));
        return new RestTemplate(factory);
    }
}
