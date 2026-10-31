package com.vitalii.messenger_hub_backend.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Transparently encrypts a String column on write and decrypts it on read.
 * Applied to messenger credentials via {@code @Convert}.
 */
@Component
@Converter
@RequiredArgsConstructor
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    private final CryptoService cryptoService;

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return cryptoService.encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        return cryptoService.decrypt(dbData);
    }
}
