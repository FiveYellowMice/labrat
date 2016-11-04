require 'json'
require 'openssl'
require 'concurrent'
require 'active_support/core_ext/object/blank'
require 'telegram/bot'

##
# This class provides an association with a Telegram bot account.

class LabRat::Telegram


  attr_reader :api

  include LabRat::Util


  def initialize(bot)
    setup_instance_variables(bot)
    @command_handler = CommandHandler.new(self)

    Thread.new do
      Telegram::Bot::Client.run(@config.telegram.token) do |helper|
        @api = helper.api

        loop do
          begin
            helper.listen do |message|
              Concurrent::Future.execute do
                begin
                  receive(message)
                rescue => e
                  log_error e
                end
              end
            end
          rescue Telegram::Bot::Exceptions::ResponseError => e
            log_error e
          end
        end
      end

      raise 'Telegram adapter terminated!'
    end
  end


  ##
  # Switch depends on the message type.

  def receive(message)
    log_debug { "Received message: " + JSON.generate(message.to_compact_hash) }

    case message
    when Telegram::Bot::Types::Message
      if command? message
        handle_command Command.new(
          name: /^\/(\w+)/.match(message.text)[1],
          arg: /^\/\w+(?:@\w+)? ?(.*)$/.match(message.text)[1],
          message: message
        )
      end
    when Telegram::Bot::Types::InlineQuery
      handle_inline_query message
    end
  end

  private :receive


  ##
  # Reply to a message.

  def reply_message(message, options = {})
    params = {
      chat_id: message.chat.id,
      reply_to_message_id: message.message_id
    }

    params.merge! options

    @api.send_message(params)
  end


  ##
  # Determine if a message is a command.

  def command?(message)
    return false unless message.text
    return false unless message.text[0] == '/'
    return false unless message.text =~ %r[^(?:/\w+@#{@config.telegram.username}|/\w+(?!@))(?: |$)]
    return true
  end

  private :command?


  ##
  # Respond to a command.

  def handle_command(command)
    if CommandHandler.public_instance_methods(false).include?(command.name.to_sym)
      log_debug { "Replying command #{command}" }

      @command_handler.public_send(command.name, command)

    else
      log_debug { "Command #{command.name} not found." }

      if command.message.chat.type == 'private' ||
        (command.message.reply_to_message &&
        command.message.reply_to_message.from.username == @config.telegram.username) then
        reply_message(command.message, text: "LabRat: #{command.name}: command not found")
      end
    end
  end

  private :handle_command


  ##
  # Respond to an inline query.

  def handle_inline_query(message)
    results = [
      if message.query.blank?
        Telegram::Bot::Types::InlineQueryResultArticle.new(
          title: 'Google',
          input_message_content: Telegram::Bot::Types::InputTextMessageContent.new(
            message_text: "https://www.google.com/"
          )
        )
      else
        Telegram::Bot::Types::InlineQueryResultArticle.new(
          title: "#{message.query} - Google",
          input_message_content: Telegram::Bot::Types::InputTextMessageContent.new(
            message_text: "https://www.google.com/search?q=#{CGI.escape(message.query)}"
          )
        )
      end,
      if message.query.blank?
        Telegram::Bot::Types::InlineQueryResultArticle.new(
          title: 'Wikipedia',
          input_message_content: Telegram::Bot::Types::InputTextMessageContent.new(
            message_text: "https://zh.wikipedia.org/"
          )
        )
      else
        Telegram::Bot::Types::InlineQueryResultArticle.new(
          title: "#{message.query} - Wikipedia",
          input_message_content: Telegram::Bot::Types::InputTextMessageContent.new(
            message_text: "https://zh.wikipedia.org/wiki/#{encode_uri_component(message.query)}"
          )
        )
      end
    ].compact.map do |item|
      item.id = OpenSSL::Digest::SHA1.new.digest(item.input_message_content.message_text).codepoints.map{|c| c.to_s(16) }.join
      item
    end

    @api.answer_inline_query(
      inline_query_id: message.id,
      cache_time: 0,
      results: results
    )
  end

  private :handle_inline_query


  autoload :Command,        'labrat/telegram/command'
  autoload :CommandHandler, 'labrat/telegram/command_handler'


end
