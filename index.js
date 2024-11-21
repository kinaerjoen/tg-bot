require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const TOKEN = process.env.TOKEN_BOT;

const bot = new TelegramBot(TOKEN, { polling: true });

let userState = {};
let timer;


async function fetchQuestions(category) {
  try {
    const response = await fetch(
      `https://the-trivia-api.com/api/questions?limit=5&tags=${category}`
    );
    if (response.ok) {
      return await response.json();
    } else {
      console.error(`Ошибка HTTP: ${response.status}`);
      return [];
    }
  } catch (err) {
    console.error("Произошла ошибка при получении данных:", err);
    return [];
  }
}


bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет! Я бот-викторина. Набери /quiz, чтобы начать!"
  );
});


function chooseCategory(chatId) {
  if (userState[chatId] && userState[chatId].active) {
    bot.sendMessage(chatId, "Вы уже проходите викторину. Завершите её перед началом новой.");
    return;
  }

  bot.sendMessage(chatId, "Пожалуйста, выберите категорию:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "История", callback_data: "&history" },
          { text: "Наука", callback_data: "&science" },
          { text: "Музыка", callback_data: "&music" },
        ],
        [
          { text: "География", callback_data: "&geography" },
          { text: "Личности", callback_data: "&people" },
          { text: "Спорт", callback_data: "&sport" },
        ],
        [
          { text: "Фильмы и сериалы", callback_data: "&film_and_tv" },
          { text: "Еда и напитки", callback_data: "&food_and_drink" },
        ],
        [
          { text: "Искусство и литература", callback_data: "&arts_and_literature" },
          { text: "Общество и культура", callback_data: "&society_and_culture" },
        ],
      ],
    },
  });
}


bot.onText(/\/quiz/, (msg) => {
  chooseCategory(msg.chat.id);
});


async function startQuiz(chatId, category) {
  if (userState[chatId] && userState[chatId].active) {
    bot.sendMessage(chatId, "Вы уже проходите викторину. Завершите её перед началом новой.");
    return;
  }

  // active - не дает пользователю начать две викторины одновременно
  // answered - не дает пользователю нажать на два варианта ответа в одном вопросе одновременно
  userState[chatId] = { active: true, currentQuestionIndex: 0, score: 0, questions: [], answered: false };

  try {
    const questions = await fetchQuestions(category);
    if (questions.length === 0) {
      bot.sendMessage(
        chatId,
        "Произошла ошибка при загрузке вопросов. Попробуйте позже."
      );
      delete userState[chatId];
    } else {
      userState[chatId].questions = questions;
      sendQuestion(chatId);
    }
  } catch {
    bot.sendMessage(
      chatId,
      "Произошла ошибка при загрузке вопросов. Попробуйте позже."
    );
    delete userState[chatId];
  }
}

async function sendQuestion(chatId) {
  try {
    const user = userState[chatId];

    if (!user || !user.active) return;
    user.answered = false;

    if (user.currentQuestionIndex < user.questions.length) {
      const currentQuestion = user.questions[user.currentQuestionIndex];
      const options = [
        ...currentQuestion.incorrectAnswers,
        currentQuestion.correctAnswer,
      ].sort(() => Math.random() - 0.5);

      const inlineKeyboard = options.map((option) => [
        { text: option, callback_data: option },
      ]);

      let i = 15;
      const questionMessage = await bot.sendMessage(
        chatId,
        `${currentQuestion.question} Осталось секунд: ${i}`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        }
      );
      
      timer = setInterval(async() => {
        i--;
        if (i > -1) {
          bot.editMessageText(`${currentQuestion.question} Осталось секунд: ${i}`, {
            chat_id: chatId,
            message_id: questionMessage.message_id,
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            },
          }).catch((err) => {
            console.error("Ошибка редактирования сообщения:", err);
          });
        } else {
          if (!user.answered) {
            await bot.sendMessage(
              chatId,
              `Время вышло! Правильный ответ: ${currentQuestion.correctAnswer}`
            );
            user.answered = true;
          }
          clearInterval(timer);
          user.currentQuestionIndex++;
          sendQuestion(chatId);
        }
      }, 1000);
    } else {
      bot.sendMessage(
        chatId,
        `Викторина завершена! Ваш результат: ${user.score}/${user.questions.length}`
      ).then(() => {
        bot.sendMessage(chatId, "Хотите сыграть еще раз?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Да, начать заново", callback_data: "start_quiz" }],
              [{ text: "Нет, спасибо", callback_data: "end_quiz" }],
            ],
          },
        });
      });

      delete userState[chatId];
      clearInterval(timer);
    }
  } catch {
    bot.sendMessage(chatId, "Произошла ошибка при отправке вопроса. Начните викторину заново.");
    delete userState[chatId];
    clearInterval(timer);
  }
}


async function handleAnswer(chatId, answer) {
  try {
    const user = userState[chatId];
    if (!user || !user.active || user.answered) return; 

    const question = user.questions[user.currentQuestionIndex];
    user.answered = true;

    if (answer === question.correctAnswer) {
      user.score++;
      await bot.sendMessage(chatId, "Правильно!");
    } else {
      await bot.sendMessage(
        chatId,
        `Неправильно! Правильный ответ: ${question.correctAnswer}`
      );
    }

    clearInterval(timer);
    user.currentQuestionIndex++;
    sendQuestion(chatId);
  } catch {
    bot.sendMessage(chatId, "Произошла ошибка при обработке ответа.");
  }
}


bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const answer = callbackQuery.data;

  if (answer.startsWith("&")) {
    startQuiz(chatId, answer.slice(1));
  } else if (answer === "start_quiz") {
    chooseCategory(chatId);
  } else if (answer === "end_quiz") {
    bot.sendMessage(chatId, "Спасибо за игру! Возвращайтесь в любое время.");
    delete userState[chatId];
    clearInterval(timer);
  } else {
    handleAnswer(chatId, answer);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});