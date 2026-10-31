package com.vitalii.messenger_hub_backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Lets background work happen only when it is not in the user's way.
 *
 * Three jobs grew up independently — archiving, embedding, transcribing — each on its own
 * schedule, each reasonable alone. Together they saturated the machine: transcription runs
 * at roughly real time, so five clips every two minutes never finished before the next tick
 * started, while embedding held Ollama and archiving held the same Telegram connection the
 * chat list needs. The application spent its time competing with itself.
 *
 * Two rules fix it, and both are about priority rather than speed:
 *
 * <ul>
 *   <li>only one background job at a time — they share one CPU and one connection per
 *       messenger, so running two makes each slower rather than the pair faster;</li>
 *   <li>nothing starts while the user is doing something — a person waiting for a chat to
 *       open outranks an archive that has all night.</li>
 * </ul>
 *
 * Skipping a tick costs nothing: every one of these jobs is a backlog drain that will be
 * offered the same work again in a minute.
 */
@Service
@Slf4j
public class BackgroundWorkGate {

    /** Only one background job runs at a time, whichever asks first. */
    private final ReentrantLock lock = new ReentrantLock();

    private final AtomicLong lastUserRequest = new AtomicLong(0);

    /**
     * How recently the user has to have done something for background work to stand aside.
     *
     * Generous on purpose. The chat list polls every 25 seconds, so a shorter window would
     * treat an idle open tab as an active user and never let anything run; a longer one
     * would keep working through a burst of clicks.
     */
    @Value("${background.user-quiet-ms:20000}")
    private long quietMillis;

    /** Called for every request the browser makes. */
    public void markUserActivity() {
        lastUserRequest.set(System.currentTimeMillis());
    }

    public boolean userIsActive() {
        return System.currentTimeMillis() - lastUserRequest.get() < quietMillis;
    }

    /**
     * Runs the job if the machine is free and the user is not waiting on anything.
     *
     * @return true when the work ran, false when the tick was yielded
     */
    public boolean runIfIdle(String name, Runnable work) {
        if (userIsActive()) {
            log.debug("{} skipped: user is active", name);
            return false;
        }
        if (!lock.tryLock()) {
            log.debug("{} skipped: another background job is running", name);
            return false;
        }
        try {
            work.run();
            return true;
        } finally {
            lock.unlock();
        }
    }
}
