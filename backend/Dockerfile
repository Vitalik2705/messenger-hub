# ── Build ─────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build

# Wrapper and build scripts first: these change far less often than source, so the
# dependency download below stays cached across ordinary code edits.
COPY gradlew ./
COPY gradle ./gradle
COPY build.gradle settings.gradle ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies --quiet || true

COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre
WORKDIR /app

# Runs unprivileged: nothing here needs root, and a container that cannot write to
# its own filesystem is a smaller problem when something else goes wrong.
RUN useradd --create-home --shell /usr/sbin/nologin app
USER app

COPY --from=build --chown=app:app /build/build/libs/*.jar app.jar

EXPOSE 8279

# Exec form so the JVM is PID 1 and receives SIGTERM directly — without it, docker
# stop waits out the full timeout and then kills the process mid-transaction.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
