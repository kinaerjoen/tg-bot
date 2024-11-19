require("dotenv").config(); // Подключение библиотеки dotenv для работы с переменными окружения
const TelegramBot = require("node-telegram-bot-api");
const TOKEN = process.env.TOKEN_BOT;

const bot = new TelegramBot(TOKEN, { polling: true });

let userState = {}; // Объект для хранения состояния пользователей (текущий вопрос, набранные баллы и т.д.)

/**
 * Функция для получения вопросов с The Trivia API
 * @returns {Array} Массив вопросов
 */

async function fetchQuestions() {
  try {
    const response = await fetch(
      "https://the-trivia-api.com/api/questions?limit=5"
    );
    if (response.ok) {
      return await response.json(); // Возвращаем результат вызова в виде промиса
    } else {
      console.error(`Ошибка HTTP: ${response.status}`);
      return []; // Возвращаем пустой массив в случае ошибки
    }
  } catch (err) {
    console.error("Произошла ошибка при получении данных:", err);
    return []; // Возвращаем пустой массив в случае ошибки
  }
}

/**
 * Обработчик команды /start
 * Отправляет приветственное сообщение
 */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет! Я бот-викторина. Набери /quiz, чтобы начать!"
  );
});

/**
 * Обработчик команды /quiz
 * Начинает викторину для пользователя
 */
bot.onText(/\/quiz/, async (msg) => {
  startQuiz(msg.chat.id);
});

/**
 * Функция для начала новой викторины
 * @param {Number} chatId Идентификатор чата пользователя
 */
async function startQuiz(chatId) {
  userState[chatId] = { currentQuestionIndex: 0, score: 0, questions: [] };

  try {
    const questions = await fetchQuestions();
    if (questions.length === 0) {
      bot.sendMessage(
        chatId,
        "Произошла ошибка при загрузке вопросов. Попробуйте позже."
      );
    } else {
      userState[chatId].questions = questions;
      sendQuestion(chatId);
    }
  } catch (error) {
    bot.sendMessage(
      chatId,
      "Произошла ошибка при загрузке вопросов. Попробуйте позже."
    );
  }
}

/**
 * Функция для отправки вопроса пользователю с кнопками
 * @param {Number} chatId Идентификатор чата пользователя
 */
function sendQuestion(chatId) {
  const user = userState[chatId];

  if (user.currentQuestionIndex < user.questions.length) {
    const currentQuestion = user.questions[user.currentQuestionIndex];
    const options = [
      ...currentQuestion.incorrectAnswers,
      currentQuestion.correctAnswer,
    ].sort(() => Math.random() - 0.5);

    const inlineKeyboard = options.map((option) => [
      { text: option, callback_data: option },
    ]);

    bot.sendMessage(chatId, currentQuestion.question, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  } else {
    // Отправляем результат викторины пользователю
    bot
      .sendMessage(
        chatId,
        `Викторина завершена! Ваш результат: ${user.score}/${user.questions.length}`
      )
      .then(() => {
        // После отправки результата предлагаем сыграть еще раз
        bot.sendMessage(chatId, "Хотите сыграть еще раз?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Да, начать заново", callback_data: "start_quiz" }],
              [{ text: "Нет, спасибо", callback_data: "end_quiz" }],
            ],
          },
        });
      });

    // Удаляем состояние пользователя после завершения викторины
    delete userState[chatId];
  }
}

/**
 * Обработчик callback query
 * Обрабатывает ответы пользователя и события после завершения викторины
 */
bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const answer = callbackQuery.data;

  if (answer === "start_quiz") {
    startQuiz(chatId); // Начинаем новую викторину, если пользователь выбрал "начать заново"
  } else if (answer === "end_quiz") {
    bot.sendMessage(chatId, "Спасибо за игру! Возвращайтесь в любое время.");
  } else if (userState[chatId]) {
    handleAnswer(chatId, answer);
  }

  // Отправляем ответ на callback_query, чтобы Telegram убрал подсветку кнопки
  bot.answerCallbackQuery(callbackQuery.id);
});

/**
 * Функция для обработки ответа пользователя
 * @param {Number} chatId Идентификатор чата пользователя
 * @param {String} answer Ответ пользователя
 */
async function handleAnswer(chatId, answer) {
  const user = userState[chatId];
  const question = user.questions[user.currentQuestionIndex];

  if (answer === question.correctAnswer) {
    user.score++;
    await bot.sendMessage(chatId, "Правильно!"); // Ждём, пока сообщение отправится
  } else {
    await bot.sendMessage(
      chatId,
      `Неправильно! Правильный ответ: ${question.correctAnswer}`
    ); // Ждём, пока сообщение отправится
  }

  user.currentQuestionIndex++;
  sendQuestion(chatId); // После отправки сообщения отправляем следующий вопрос
}
