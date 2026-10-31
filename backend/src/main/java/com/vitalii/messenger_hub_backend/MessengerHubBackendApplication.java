package com.vitalii.messenger_hub_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class MessengerHubBackendApplication {

	static void main(String[] args) {
		SpringApplication.run(MessengerHubBackendApplication.class, args);
	}

}
