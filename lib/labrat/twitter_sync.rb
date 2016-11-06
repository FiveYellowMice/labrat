require 'cgi'
require 'concurrent'
require 'active_support/core_ext/numeric/time'
require 'twitter'

##
# Sync Twitter with Telegram channel.

class LabRat::TwitterSync


  attr_reader :api

  include LabRat::Util


  def initialize(bot)
    setup_instance_variables(bot)

    @api = Twitter::REST::Client.new do |config|
      %w(consumer_key consumer_secret access_token access_token_secret).each do |k|
        config.send "#{k}=", @config.twitter.send(k)
      end
    end

    unless @options.test_tweet
      Concurrent::TimerTask.execute(execution_interval: 30.minutes, run_now: true) do
        begin
          run
        rescue => e
          log_error e
        end
      end
    else
      Concurrent::Future.execute do
        begin
          process_tweet @api.status(@options.test_tweet)
        rescue => e
          log_error e
        end
      end
    end
  end


  ##
  # Do the work.

  def run
    log_info { "Syncing with Twitter..." }

    params = {
      trim_user: false,
      exclude_replies: false,
      include_rts: true
    }

    if @options.debug_mode || !last_tweet_id
      log_debug { "Debug mode is on or last_tweet_id.txt not found, getting 1 most recent Tweet." }
      params[:count] = 1
    else
      params[:since_id] = last_tweet_id
    end

    tweets = @api.home_timeline(params).delete_if do |t|
      t.in_reply_to_user_id || t.source =~ /labrat/i
    end.sort do |a, b|
      a.created_at - b.created_at
    end

    log_info { "Fount #{tweets.length} new Tweets." }

    tweets.each do |tweet|
      process_tweet tweet
    end
  end


  ##
  # Deal with one Tweet.

  def process_tweet(tweet)
    log_info { "New Tweet: #{tweet.uri}" }

    text = convert_all_entities(tweet)

    if tweet.retweeted?
      text = "From <a href=\"https://twitter.com/#{tweet.user.screen_name}\">@#{tweet.user.screen_name}</a>:\n" + text
    elsif tweet.quoted_status?
      text = text + "\n\n" +
        "From <a href=\"https://twitter.com/#{tweet.quoted_status.user.screen_name}\">@#{tweet.quoted_status.user.screen_name}</a>:\n" +
        convert_all_entities(tweet.quoted_status)
    end

    text = text + "\n\n<a href=\"#{tweet.uri}\">Reply</a>"

    @bot.telegram.api.send_message(
      chat_id: @config.twitter.target_channel,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    )

  end


  ##
  # Convert all entities in a Tweet to HTML string.

  def convert_all_entities(tweet)
    log_debug { tweet.text }

    text = tweet.text

    entities = tweet.uris + tweet.user_mentions + tweet.hashtags + tweet.media
    entities.sort! {|a, b| b.indices[0] - a.indices[0] } # Reverse

    # Remove last entity that is a link to media or quoted Tweet or truncated.
    if entities[0] && entities[0].indices[1] == tweet.text.length
      last_entity = entities[0]
      if
        last_entity.respond_to?(:sizes) || # Responds to sizes means it is a media.
        (
          last_entity.is_a?(Twitter::Entity::URI) &&
          (tweet.truncated? || tweet.quoted_status?)
        )
      then
        log_debug { "Last entity should be removed." }
        text = text[ 0 ... last_entity.indices[0] ]
        entities.shift
      end
    end

    # Remove all media entities from list.
    entities.delete_if {|e| e.respond_to? :sizes }

    if entities.any?
      log_debug { "There are #{entities.length} entities." }

      entities.each_index do |i|
        entity          = entities[i]
        previous_entity = entities[i - 1]
        next_entity     = entities[i + 1]

        log_debug { "#{i} #{entity.class} #{entity.indices}" }

        text_before_entity = text[         0         ... entity.indices[0] ]
        text_after_entity  = text[ entity.indices[1] ..         -1         ]

        log_debug { "Text before entity: #{text_before_entity}" }
        log_debug { "Text after entity: #{text_after_entity}" }

        if !previous_entity
          # Last entity in position.
          text_after_entity = h(text_after_entity)
        end

        if !next_entity
          # First entity in position.
          text_before_entity = h(text_before_entity)
        else
          # If there is next entity.
          text_between_next_and_current_entity = text_before_entity[ next_entity.indices[1] ...    entity.indices[0]   ]
          text_before_end_of_next_entity       = text_before_entity[           0            ... next_entity.indices[1] ]

          text_before_entity = text_before_end_of_next_entity + h(text_between_next_and_current_entity)
        end

        text = text_before_entity + convert_entity(entity) + text_after_entity

        log_debug { "Text after converting this entity: #{text}" }
      end
    else
      text = h(text)
    end

    return text
  end


  ##
  # Convert entity to HTML string.

  def convert_entity(entity)
    case entity
    when Twitter::Entity::URI
      "<a href=\"#{h entity.expanded_url}\">#{h entity.display_url}</a>"
    when Twitter::Entity::UserMention
      "<a href=\"https://twitter.com/#{entity.screen_name}\">@#{entity.screen_name}</a>"
    when Twitter::Entity::Hashtag
      "<a href=\"https://twitter.com/hashtag/#{h encode_uri_component entity.text}\">##{h entity.text}</a>"
    else
      ''
    end
  end


  ##
  # Read ID of last Tweet.

  def last_tweet_id
    return @last_tweet_id if @last_tweet_id

    begin
      id_str = File.read(File.expand_path('last_tweet_id.txt', @options.data_dir)).chomp
    rescue Errno::ENOENT
      return nil
    end

    if id_str =~ /^\d+$/
      id = id_str.to_i
      @last_tweet_id = id
      return id
    else
      return nil
    end
  end


  ##
  # Change ID of last Tweet.

  def last_tweet_id=(val)
    File.write(File.expand_path('last_tweet_id.txt', @options.data_dir), val.to_s + "\n")
    @last_tweet_id = val
  end


  ##
  # Escape HTML characters.

  def h(str)
    str.to_s.
    gsub('&', '&amp;').
    gsub('"', '&quot;').
    gsub('<', '&lt;').
    gsub('>', '&gt;')
  end

  private :h


end
